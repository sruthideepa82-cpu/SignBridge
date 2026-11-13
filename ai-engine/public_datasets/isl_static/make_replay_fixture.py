"""Records real /api/recognition/latest responses for a short scripted sequence of held-out test images.

Each frame: real MediaPipe on the image -> backend hand objects -> the real FastAPI route -> the active static model.
The camera is a stand-in that returns the chosen hands, because no webcam is available. The output is a snapshot of
what the backend answered at the time. The frontend test replays it. Re-run this script if the model changes.

Sequence: B x8, one uncertain frame of B, B x8, C x8, no hand x3, B x8.
"""

import argparse
import csv
import json
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path

from fastapi.testclient import TestClient

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "backend"))

import inspect_isl_static as extraction  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.hand_detection_service import DetectedHand, LandmarkPoint  # noqa: E402


@dataclass
class Snapshot:
    running: bool = True
    frame_sequence: int = 0
    hands: tuple = field(default_factory=tuple)
    detection_available: bool = True
    detection_error: str | None = None


class ScriptedCamera:
    def __init__(self) -> None:
        self.hands: tuple = ()
        self.sequence = 0

    def landmark_snapshot(self) -> Snapshot:
        self.sequence += 1
        return Snapshot(frame_sequence=self.sequence, hands=self.hands)

    def hand_history(self, count: int) -> tuple:
        return ()


def mediapipe_hands(image: Path) -> tuple:
    import numpy as np
    from mediapipe import Image as MpImage
    from mediapipe import ImageFormat
    from PIL import Image

    if extraction._landmarker is None:
        extraction._init_landmarker(str(extraction.DEFAULT_MODEL))
    with Image.open(image) as picture:
        rgb = np.asarray(picture.convert("RGB"), dtype=np.uint8)
    detection = extraction._landmarker.detect(MpImage(image_format=ImageFormat.SRGB, data=rgb))
    hands = []
    for landmarks, handedness in zip(detection.hand_landmarks, detection.handedness):
        points = tuple(LandmarkPoint(index=i, name=f"P{i}", x=p.x, y=p.y, z=p.z) for i, p in enumerate(landmarks))
        hands.append(DetectedHand(handedness=handedness[0].category_name, score=float(handedness[0].score), landmarks=points))
    return tuple(hands)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    dataset = REPO / "ai-engine" / "dataset" / "public" / "isl_static"
    with (dataset / "training" / "test_paths.csv").open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    rng = random.Random(args.seed)
    rng.shuffle(rows)

    camera = ScriptedCamera()
    client = TestClient(create_app(Settings(recognition_model_path=REPO / "ai-engine" / "models" / "static_classifier.joblib"),
                                   camera_service=camera))

    def answer(hands: tuple) -> dict:
        camera.hands = hands
        return client.get("/api/recognition/latest").json()

    def find(letter: str, want_status: str) -> tuple[str, tuple]:
        for row in rows:
            if row["label"] != letter:
                continue
            hands = mediapipe_hands(args.root / row["rel_path"])
            if len(hands) != 1:
                continue
            if answer(hands)["status"] == want_status:
                return row["rel_path"], hands
        raise SystemExit(f"No held-out {letter} image gave status {want_status}.")

    b_path, b_hands = find("B", "recognized")
    c_path, c_hands = find("C", "recognized")
    u_path, u_hands = find("B", "uncertain")

    script = (
        [("B", b_hands)] * 8 + [("uncertain", u_hands)] + [("B", b_hands)] * 8
        + [("C", c_hands)] * 8 + [("none", ())] * 3 + [("B", b_hands)] * 8
    )
    frames = []
    for name, hands in script:
        response = answer(hands)
        frames.append({"scripted": name, "response": response})

    fixture = {
        "source": "Real MediaPipe + real active static model via /api/recognition/latest (see make_replay_fixture.py).",
        "images": {"B": b_path, "C": c_path, "uncertain_B": u_path},
        "frames": frames,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fixture, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(frames)} frames to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
