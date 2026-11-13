"""Developer-only store for labelled landmark clips.

A clip is one recording of many frames for one label. Only MediaPipe landmark coordinates are stored. No frames,
images or video are written. The validation rules come from ai-engine/collection/sample_record.py, the same file the
offline collector uses, so both collection paths enforce identical rules.

A label is accepted only when it is a verified class in vocabulary.json, or the UNKNOWN class (frames that show no
valid sign). Participant IDs must be pseudonyms and a consent reference is required for every clip.
"""

import csv
import importlib.util
import io
import json
import math
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from typing import Any

UNKNOWN_LABEL = "UNKNOWN"
SCHEMA = "signbridge-clip/v1"
EXPORT_SCHEMA = "signbridge-dataset/v1"
SESSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$")
# Same rule as signbridge_training/01_extract_landmarks.py: a sign clip needs hands in at least 30% of its frames.
MIN_HAND_FRAME_SHARE = 0.3
LANDMARKS = 21
HAND_SLOTS = ("Left", "Right")

_sample_record: ModuleType | None = None


def sample_record_module(ai_engine_dir: Path) -> ModuleType:
    """Loads ai-engine/collection/sample_record.py by path. It has no MediaPipe or OpenCV imports."""
    global _sample_record
    if _sample_record is None:
        path = ai_engine_dir / "collection" / "sample_record.py"
        spec = importlib.util.spec_from_file_location("signbridge_sample_record", path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load {path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _sample_record = module
    return _sample_record


class DatasetError(ValueError):
    """A clip was refused. The message is safe to show to the developer."""


class DatasetStore:
    def __init__(
        self,
        root: Path,
        vocabulary_path: Path,
        min_frames: int,
        max_frames: int,
        ai_engine_dir: Path,
    ) -> None:
        self._root = root
        self._vocabulary_path = vocabulary_path
        self._min_frames = min_frames
        self._max_frames = max_frames
        self._rules = sample_record_module(ai_engine_dir)

    @property
    def clips_dir(self) -> Path:
        return self._root / "clips"

    def verified_labels(self) -> dict[str, int]:
        """Verified label -> number of hands the class uses (1 or 2)."""
        vocabulary = self._rules.load_vocabulary(self._vocabulary_path)
        return {
            label: int(entry.get("hands", 1))
            for label, entry in self._rules.verified_classes(vocabulary).items()
        }

    def load_clips(self) -> list[dict[str, Any]]:
        if not self.clips_dir.is_dir():
            return []
        clips = []
        for path in sorted(self.clips_dir.glob("*/*.json")):
            with path.open(encoding="utf-8") as handle:
                clips.append(json.load(handle))
        return clips

    def status(self) -> dict[str, Any]:
        clips = self.load_clips()
        counts: dict[str, dict[str, Any]] = {}
        for clip in clips:
            entry = counts.setdefault(clip["label"], {"clips": 0, "frames": 0, "participants": set(), "sessions": set()})
            entry["clips"] += 1
            entry["frames"] += clip["frame_count"]
            entry["participants"].add(clip["participant"])
            entry["sessions"].add(clip["session"])
        return {
            "verified_labels": self.verified_labels(),
            "unknown_label": UNKNOWN_LABEL,
            "min_frames": self._min_frames,
            "max_frames": self._max_frames,
            "total_clips": len(clips),
            "counts": {
                label: {
                    "clips": entry["clips"],
                    "frames": entry["frames"],
                    "participants": len(entry["participants"]),
                    "sessions": len(entry["sessions"]),
                }
                for label, entry in sorted(counts.items())
            },
        }

    def save_clip(
        self,
        *,
        label: str,
        participant: str,
        consent_ref: str,
        session: str,
        frames: list[dict[str, Any]],
    ) -> dict[str, Any]:
        verified = self.verified_labels()
        if label != UNKNOWN_LABEL and label not in verified:
            raise DatasetError(
                f"{label} is not a verified class. Only verified classes can be recorded. "
                f"Use {UNKNOWN_LABEL} for frames that show no valid sign."
            )
        try:
            self._rules.validate_participant(participant)
            self._rules.validate_consent_ref(consent_ref)
        except ValueError as error:
            raise DatasetError(str(error)) from error
        if not SESSION_PATTERN.match(session):
            raise DatasetError("Session ID must be 3 to 40 letters, digits, underscores or hyphens.")
        if not self._min_frames <= len(frames) <= self._max_frames:
            raise DatasetError(
                f"A clip needs between {self._min_frames} and {self._max_frames} frames. Got {len(frames)}."
            )

        hands_per_class = verified.get(label)
        frames_with_hands = 0
        for index, frame in enumerate(frames):
            hands = frame["hands"]
            if hands:
                frames_with_hands += 1
            if hands_per_class is not None and len(hands) > hands_per_class:
                raise DatasetError(
                    f"Frame {index + 1} shows {len(hands)} hands, but {label} uses {hands_per_class}."
                )
            handedness = [hand["handedness"] for hand in hands]
            if len(set(handedness)) != len(handedness):
                raise DatasetError(f"Frame {index + 1} lists the same hand twice.")
            for hand in hands:
                if not all(math.isfinite(value) for point in hand["landmarks"] for value in point):
                    raise DatasetError(f"Frame {index + 1} has landmark values that are not finite numbers.")

        if label != UNKNOWN_LABEL and frames_with_hands / len(frames) < MIN_HAND_FRAME_SHARE:
            raise DatasetError(
                f"Hands were seen in only {frames_with_hands} of {len(frames)} frames. "
                f"A {label} clip needs hands in at least {int(MIN_HAND_FRAME_SHARE * 100)}% of its frames."
            )

        clip_id = f"{participant}-{session}-{uuid.uuid4().hex[:8]}"
        clip = {
            "schema": SCHEMA,
            "clip_id": clip_id,
            "label": label,
            "participant": participant,
            "session": session,
            "consent_ref": consent_ref,
            "recorded_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "frame_count": len(frames),
            "frames_with_hands": frames_with_hands,
            "frames": frames,
        }
        target = self.clips_dir / label
        target.mkdir(parents=True, exist_ok=True)
        with (target / f"{clip_id}.json").open("x", encoding="utf-8") as handle:
            json.dump(clip, handle, separators=(",", ":"))
        return {key: clip[key] for key in clip if key != "frames"}

    def export_json(self) -> str:
        clips = sorted(self.load_clips(), key=lambda clip: (clip["label"], clip["clip_id"]))
        return json.dumps({"schema": EXPORT_SCHEMA, "clip_count": len(clips), "clips": clips}, indent=2)

    def export_csv(self) -> str:
        """One row per frame. Each hand has 21 x, y, z columns. A hand that is not in the frame is left blank."""
        columns = ["clip_id", "label", "participant", "session", "recorded_at", "frame_index", "t_ms", "left_present", "right_present"]
        for slot in HAND_SLOTS:
            for index in range(LANDMARKS):
                columns += [f"{slot.lower()}_{index}_{axis}" for axis in ("x", "y", "z")]

        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerow(columns)
        for clip in sorted(self.load_clips(), key=lambda clip: (clip["label"], clip["clip_id"])):
            for frame_index, frame in enumerate(clip["frames"]):
                by_slot = {hand["handedness"]: hand for hand in frame["hands"]}
                row = [
                    clip["clip_id"],
                    clip["label"],
                    clip["participant"],
                    clip["session"],
                    clip["recorded_at"],
                    frame_index,
                    frame["t_ms"],
                    int("Left" in by_slot),
                    int("Right" in by_slot),
                ]
                for slot in HAND_SLOTS:
                    hand = by_slot.get(slot)
                    for index in range(LANDMARKS):
                        if hand is None:
                            row += ["", "", ""]
                        else:
                            row += [f"{value:.6f}" for value in hand["landmarks"][index]]
                writer.writerow(row)
        return buffer.getvalue()
