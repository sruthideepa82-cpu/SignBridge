"""Stage 2: ordered 32-frame windows from the dynamic phrase clips, using the existing temporal feature function.

Read-only with respect to every protected file. The temporal feature function is imported through the existing
loader (backend/app/services/sequence_recognizer.py::load_feature_module) and is never copied or modified.

Assumptions (documented, not verified):
  - Each phrase folder is one assumed clip with 40 frames in frame-number order.
  - The source frame rate is unknown. Windows use consecutive frame indices only; no timestamps are invented.
  - Windows are 32 frames at stride 1 (9 per clip). Frames are not resampled, so playback speed is preserved.
  - Missing hands are stored as zero blocks, as in the existing window builder. Non-finite values are reported, not hidden.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\dynamic\\prepare_sequences.py
"""

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / "backend"))
from app.services.sequence_recognizer import MIN_HAND_FRAME_SHARE, load_feature_module  # noqa: E402

ISL = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
MANIFEST = ISL / "v2" / "phrase_manifest.csv"
LANDMARKS = ISL / "landmarks.npz"
SIGN_CODE_DIR = REPO / "signbridge_training"
REPORTS = HERE / "reports"

CLIP_FRAMES = 40
WINDOW = 32
STRIDE = 1
PER_FRAME_DIM = 141
SHAPE_DIM, TRAJ_DIM, VEL_DIM, REL_DIM = 126, 6, 6, 3
HAND_SIZE_MIN, HAND_SIZE_MAX = 0.03, 0.6
COORD_RANGE = (-0.1, 1.1)
Z_LIMIT = 1.0
MIN_HAND_SHARE = MIN_HAND_FRAME_SHARE

DYNAMIC_CLASSES_MANIFEST = None  # resolved from the manifest at load time
UNDETERMINED = ["careful", "chat", "hungry", "stop", "write"]
STATIC_ALL = ["change", "happy birthday", "keepsmile", "mistake", "problem", "questions", "remember", "shift",
              "understand", "sick", "opinion"]


def load_features_module():
    """The existing temporal feature module, imported read-only from signbridge_training/features.py."""
    module = load_feature_module(SIGN_CODE_DIR)
    if int(module.WINDOW_FRAMES) != WINDOW:
        raise SystemExit(f"feature module expects {module.WINDOW_FRAMES} frames; this stage uses {WINDOW}")
    return module


def read_manifest() -> list[dict]:
    with open(MANIFEST, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_clips(rows: list[dict], landmarks: np.ndarray, phrases: list[str]) -> dict:
    """Per phrase: frames in frame-number order, (40, 2, 21, 3) float64 with absent hands as zeros, and presence."""
    clips: dict = {}
    for phrase in phrases:
        items = sorted((r for r in rows if r["phrase_label"] == phrase), key=lambda r: int(r["frame_number"]))
        numbers = [int(r["frame_number"]) for r in items]
        if numbers != list(range(1, CLIP_FRAMES + 1)):
            raise SystemExit(f"{phrase}: frame numbers are not 1..40 in order")
        frames = np.zeros((CLIP_FRAMES, 2, 21, 3), dtype=np.float64)
        present = np.zeros((CLIP_FRAMES, 2), dtype=bool)
        nonfinite = 0
        for t, r in enumerate(items):
            raw = landmarks[int(r["landmarks_row"])].astype(np.float64)
            slot_present = ~np.isnan(raw[:, 0, 0])
            nonfinite += int(np.sum(~np.isfinite(raw[slot_present])))
            frames[t] = np.nan_to_num(raw)
            present[t] = slot_present
        clips[phrase] = {
            "frames": frames,
            "present": present,
            "frame_numbers": numbers,
            "source_files": [r["source_file"] for r in items],
            "eligibility": [r["training_eligibility"] for r in items],
            "nonfinite_inputs": nonfinite,
        }
    return clips


def make_windows(phrase: str, clip: dict, group: str) -> list[dict]:
    out = []
    for start in range(0, CLIP_FRAMES - WINDOW + 1, STRIDE):
        stop = start + WINDOW
        out.append({
            "phrase": phrase,
            "group": group,
            "start": start,
            "frame_numbers": clip["frame_numbers"][start:stop],
            "frames": clip["frames"][start:stop],
            "present": clip["present"][start:stop],
            "nonfinite_inputs": clip["nonfinite_inputs"],
        })
    return out


def per_frame_from_flat(flat: np.ndarray, frames: int = WINDOW) -> np.ndarray:
    """Splits the existing flat feature vector back into per-frame blocks. Layout (verified by tests):
    shape (frames x 126), trajectory (frames x 6), velocity (frames x 6), relative hands (frames x 3)."""
    flat = np.asarray(flat, dtype=np.float64).reshape(-1)
    offset = 0
    shape = flat[offset:offset + frames * SHAPE_DIM].reshape(frames, SHAPE_DIM)
    offset += frames * SHAPE_DIM
    traj = flat[offset:offset + frames * TRAJ_DIM].reshape(frames, TRAJ_DIM)
    offset += frames * TRAJ_DIM
    vel = flat[offset:offset + frames * VEL_DIM].reshape(frames, VEL_DIM)
    offset += frames * VEL_DIM
    rel = flat[offset:offset + frames * REL_DIM].reshape(frames, REL_DIM)
    offset += frames * REL_DIM
    if offset != flat.size:
        raise ValueError(f"feature vector has {flat.size} values; expected {offset}")
    return np.concatenate([shape, traj, vel, rel], axis=1)


def featurise(features_fn, window: dict) -> dict:
    """Runs the existing feature function on one window, the same way the sequence recognizer does (float32)."""
    batch = window["frames"].astype(np.float32)[None, ...]
    flat = features_fn(batch)[0]
    per_frame = per_frame_from_flat(flat)
    present = window["present"]
    hand_frames = int(present.any(axis=1).sum())
    share = hand_frames / WINDOW
    quality = window_quality(window, per_frame)
    return {
        **{k: window[k] for k in ("phrase", "group", "start", "frame_numbers", "nonfinite_inputs")},
        "per_frame": per_frame,
        "flat_dim": int(flat.size),
        "hand_frame_share": share,
        "hand_frames": hand_frames,
        "two_hand_frames": int(present.all(axis=1).sum()),
        "eligible": share >= MIN_HAND_SHARE,
        "exclusion_reason": "" if share >= MIN_HAND_SHARE else f"hands in {hand_frames}/{WINDOW} frames (< {MIN_HAND_SHARE:.0%})",
        **quality,
    }


def window_quality(window: dict, per_frame: np.ndarray) -> dict:
    frames, present = window["frames"], window["present"]
    coords = frames[present]  # (k, 21, 3) for present hands
    out_of_range = int(np.sum((coords[..., :2] < COORD_RANGE[0]) | (coords[..., :2] > COORD_RANGE[1])))
    z_extreme = int(np.sum(np.abs(coords[..., 2]) > Z_LIMIT))
    hand_size_flags = 0
    wrist_path = {0: 0.0, 1: 0.0}
    for slot in range(2):
        previous = None
        for t in range(WINDOW):
            if not present[t, slot]:
                previous = None
                continue
            hand = frames[t, slot]
            size = float(np.linalg.norm(hand[9, :2] - hand[0, :2]))
            if size < HAND_SIZE_MIN or size > HAND_SIZE_MAX:
                hand_size_flags += 1
            if previous is not None:
                wrist_path[slot] += float(np.linalg.norm(hand[0, :2] - previous[0, :2])) / max(size, 1e-6)
            previous = hand
    velocity = per_frame[:, SHAPE_DIM + TRAJ_DIM:SHAPE_DIM + TRAJ_DIM + VEL_DIM]
    speed = np.linalg.norm(velocity.reshape(WINDOW, 2, 3), axis=-1).max(axis=1)
    return {
        "nonfinite_features": int(np.sum(~np.isfinite(per_frame))),
        "out_of_range_coords": out_of_range,
        "extreme_z": z_extreme,
        "hand_size_anomalies": hand_size_flags,
        "motion_wrist_path": float(wrist_path[0] + wrist_path[1]),
        "velocity_mean": float(speed.mean()),
        "velocity_p95": float(np.percentile(speed, 95)),
        "velocity_max": float(speed.max()),
    }


def build_all(group_phrases: dict[str, list[str]]) -> dict:
    """group_phrases: 'dynamic', 'undetermined', 'static' -> phrase lists. Returns windows keyed by group."""
    rows = read_manifest()
    landmarks = np.load(LANDMARKS)["landmarks"]
    features_fn = load_features_module().features
    result = {}
    for group, phrases in group_phrases.items():
        clips = load_clips(rows, landmarks, phrases)
        items = []
        for phrase in phrases:
            for window in make_windows(phrase, clips[phrase], group):
                items.append(featurise(features_fn, window))
        result[group] = items
    return result


def class_quality(items: list[dict]) -> list[dict]:
    by_phrase: dict = defaultdict(list)
    for item in items:
        by_phrase[item["phrase"]].append(item)
    rows = []
    for phrase in sorted(by_phrase):
        group = by_phrase[phrase]
        reasons = Counter(i["exclusion_reason"] for i in group if not i["eligible"])
        flags = []
        if any(i["hand_size_anomalies"] > 0 for i in group):
            flags.append("hand-size anomalies")
        if any(i["out_of_range_coords"] > 0 for i in group):
            flags.append("coords outside image")
        if np.mean([i["velocity_p95"] for i in group]) > 0.5:
            flags.append("high velocity p95")
        rows.append({
            "phrase": phrase,
            "windows": len(group),
            "eligible_windows": sum(i["eligible"] for i in group),
            "excluded_windows": sum(not i["eligible"] for i in group),
            "exclusion_reasons": "; ".join(f"{k} x{v}" for k, v in reasons.items()),
            "mean_hand_share": round(float(np.mean([i["hand_frame_share"] for i in group])), 4),
            "mean_two_hand_frames": round(float(np.mean([i["two_hand_frames"] for i in group])), 2),
            "nonfinite_features": sum(i["nonfinite_features"] for i in group),
            "out_of_range_coords": sum(i["out_of_range_coords"] for i in group),
            "extreme_z": sum(i["extreme_z"] for i in group),
            "hand_size_anomalies": sum(i["hand_size_anomalies"] for i in group),
            "motion_wrist_path_mean": round(float(np.mean([i["motion_wrist_path"] for i in group])), 3),
            "velocity_p95_mean": round(float(np.mean([i["velocity_p95"] for i in group])), 4),
            "velocity_max": round(float(np.max([i["velocity_max"] for i in group])), 4),
            "flags": "; ".join(flags),
        })
    return rows


def write_quality_reports(dynamic_items: list[dict], out_rows: list[dict]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    with open(REPORTS / "dynamic_sequence_quality.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(out_rows[0].keys()))
        writer.writeheader()
        writer.writerows(out_rows)
    eligible = [i for i in dynamic_items if i["eligible"]]
    excluded = [i for i in dynamic_items if not i["eligible"]]
    lines = [
        "# Dynamic sequence quality (Stage 2)", "",
        "Within-clip windows. Every window is a 32-frame stride-1 slice of one 40-frame clip, so windows of the same",
        "clip overlap and are NOT independent. Frame rate unknown; windows use frame index only.", "",
        f"- Phrases: {len({i['phrase'] for i in dynamic_items})}",
        f"- Windows: {len(dynamic_items)} ({len(eligible)} eligible, {len(excluded)} excluded)",
        f"- Feature dimension per window: {dynamic_items[0]['flat_dim']} flat, {PER_FRAME_DIM} per frame x {WINDOW} frames",
        f"- Non-finite feature values: {sum(i['nonfinite_features'] for i in dynamic_items)}",
        f"- Hand-size anomalies (per present hand-frame): {sum(i['hand_size_anomalies'] for i in dynamic_items)}",
        f"- Coordinates outside [{COORD_RANGE[0]}, {COORD_RANGE[1]}]: {sum(i['out_of_range_coords'] for i in dynamic_items)}",
        "", "## Per phrase", "",
        "| Phrase | Windows | Eligible | Mean hand share | Two-hand frames | Hand-size anomalies | Velocity p95 | Flags |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for r in out_rows:
        lines.append(
            f"| {r['phrase']} | {r['windows']} | {r['eligible_windows']} | {r['mean_hand_share']} | "
            f"{r['mean_two_hand_frames']} | {r['hand_size_anomalies']} | {r['velocity_p95_mean']} | {r['flags']} |"
        )
    (REPORTS / "dynamic_sequence_quality.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def dynamic_phrases(rows: list[dict]) -> list[str]:
    return sorted({r["phrase_label"] for r in rows if r["gesture_category"] == "dynamic"})


def main() -> int:
    rows = read_manifest()
    phrases = dynamic_phrases(rows)
    if len(phrases) != 28:
        raise SystemExit(f"expected 28 dynamic phrases in the manifest, found {len(phrases)}")
    windows = build_all({"dynamic": phrases})["dynamic"]
    out_rows = class_quality(windows)
    write_quality_reports(windows, out_rows)
    eligible = sum(i["eligible"] for i in windows)
    print(f"phrases {len(phrases)} | windows {len(windows)} | eligible {eligible} | excluded {len(windows) - eligible}")
    print(f"flat feature dim {windows[0]['flat_dim']} | per-frame {PER_FRAME_DIM} x {WINDOW}")
    print(f"non-finite features {sum(i['nonfinite_features'] for i in windows)}")
    print(f"wrote {REPORTS / 'dynamic_sequence_quality.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
