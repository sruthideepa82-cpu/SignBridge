import numpy as np
import pytest

from app.core.config import BACKEND_DIR
from app.services.face_detection_service import FaceDetector
from app.services.face_expression_service import classify_expression
from tests.conftest import load_fixture_image

FACE_MODEL_PATH = BACKEND_DIR / "models" / "face_landmarker.task"
REQUIRED_BLENDSHAPES = {"mouthSmileLeft", "mouthSmileRight", "jawOpen", "browDownLeft", "browInnerUp", "eyeWideLeft"}


@pytest.fixture(scope="module")
def face_detector() -> FaceDetector:
    if not FACE_MODEL_PATH.is_file():
        pytest.skip("face_landmarker.task is missing; run `python scripts/download_models.py`")
    detector = FaceDetector(FACE_MODEL_PATH)
    yield detector
    detector.close()


def test_real_model_finds_one_face_with_478_landmarks_and_blendshapes(face_detector: FaceDetector) -> None:
    result = face_detector.detect(load_fixture_image("face/grace_hopper.jpg"))

    assert len(result.faces) == 1
    face = result.faces[0]
    assert face.landmark_count == 478
    assert len(face.points) == 478
    assert face.blendshapes is not None
    assert REQUIRED_BLENDSHAPES <= face.blendshapes.keys()
    assert all(0.0 <= score <= 1.0 for score in face.blendshapes.values())


def test_real_neutral_face_is_classified_as_neutral(face_detector: FaceDetector) -> None:
    face = face_detector.detect(load_fixture_image("face/grace_hopper.jpg")).faces[0]

    estimate = classify_expression(face.blendshapes)

    assert estimate.label == "Neutral"


def test_blank_frame_has_no_face() -> None:
    if not FACE_MODEL_PATH.is_file():
        pytest.skip("face_landmarker.task is missing; run `python scripts/download_models.py`")
    blank = np.full((480, 640, 3), 137, dtype=np.uint8)
    detector = FaceDetector(FACE_MODEL_PATH)
    try:
        result = detector.detect(blank)
    finally:
        detector.close()

    assert result.faces == ()


def test_annotation_draws_on_a_copy_and_keeps_the_frame_size(face_detector: FaceDetector) -> None:
    frame = load_fixture_image("face/grace_hopper.jpg")
    result = face_detector.detect(frame)

    annotated = face_detector.annotate(frame, result)

    assert annotated.shape == frame.shape
    assert not np.array_equal(annotated, frame)
