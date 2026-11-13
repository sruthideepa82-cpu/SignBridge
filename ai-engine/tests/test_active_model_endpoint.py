"""End to end with the active static model: MediaPipe on a real image -> backend hand objects -> /api/recognition/latest.

The camera is replaced by a stand-in that returns the hands MediaPipe found on the image, because no webcam is
available in tests. Everything after the camera is the real code: the FastAPI route, StaticRecognizer and the
active model file. Skipped when the dataset or the model is not on this machine."""

import csv
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[2]
ISL = REPO / "ai-engine" / "public_datasets" / "isl_static"
sys.path.insert(0, str(ISL))
sys.path.insert(0, str(REPO / "backend"))

from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.hand_detection_service import DetectedHand, LandmarkPoint  # noqa: E402

ACTIVE_MODEL = REPO / "ai-engine" / "models" / "static_classifier.joblib"
DATASET = REPO / "ai-engine" / "dataset" / "public" / "isl_static"
DATASET_ROOT = REPO / "Static gestures of Indian Sign Language (ISL) for English Alphabet, Hindi Vowels and Numerals" / "ISL Images"
MEDIAPIPE_MODEL = REPO / "backend" / "models" / "hand_landmarker.task"
APPROVED = set("A B C D F G I K M N P R S T W X".split())

needs_everything = pytest.mark.skipif(
    not (ACTIVE_MODEL.exists() and (DATASET / "training" / "test_paths.csv").exists()
         and DATASET_ROOT.exists() and MEDIAPIPE_MODEL.exists()),
    reason="active model, dataset or MediaPipe model not on this machine",
)


@dataclass
class FakeSnapshot:
    running: bool = True
    frame_sequence: int = 1
    hands: tuple = field(default_factory=tuple)


class FakeCamera:
    def __init__(self, hands):
        self._hands = hands

    def landmark_snapshot(self):
        return FakeSnapshot(hands=self._hands)


def mediapipe_hands(image: Path) -> tuple:
    """The hands MediaPipe finds on one image, as the backend's DetectedHand objects."""
    import numpy as np
    from PIL import Image

    import inspect_isl_static as extraction
    from mediapipe import Image as MpImage
    from mediapipe import ImageFormat

    if extraction._landmarker is None:
        extraction._init_landmarker(str(MEDIAPIPE_MODEL))
    with Image.open(image) as picture:
        rgb = np.asarray(picture.convert("RGB"), dtype=np.uint8)
    detection = extraction._landmarker.detect(MpImage(image_format=ImageFormat.SRGB, data=rgb))
    hands = []
    for landmarks, handedness in zip(detection.hand_landmarks, detection.handedness):
        points = tuple(LandmarkPoint(index=i, name=f"P{i}", x=p.x, y=p.y, z=p.z) for i, p in enumerate(landmarks))
        hands.append(DetectedHand(handedness=handedness[0].category_name, score=float(handedness[0].score), landmarks=points))
    return tuple(hands)


@needs_everything
def test_active_model_answers_the_latest_endpoint_from_a_real_image():
    rows = list(csv.DictReader((DATASET / "training" / "test_paths.csv").open(encoding="utf-8")))
    hands = None
    chosen = None
    for row in rows[:80]:
        found = mediapipe_hands(DATASET_ROOT / row["rel_path"])
        # The static model is one-handed by contract. The endpoint answers two_hands for two-hand frames.
        if len(found) == 1:
            hands, chosen = found, row
            break
    assert hands is not None, "MediaPipe found no single-hand image in the first held-out images"

    settings = Settings(recognition_model_path=ACTIVE_MODEL, recognition_threshold=0.0)
    client = TestClient(create_app(settings, camera_service=FakeCamera(hands)))
    body = client.get("/api/recognition/latest").json()

    assert body["status"] in {"recognized", "uncertain"}
    assert body["experimental"] is True
    assert body["verification"] == "unverified_dataset"
    assert body["confidence"] is not None
    if body["status"] == "recognized":
        assert body["label"] in APPROVED
    assert chosen["label"] in APPROVED
