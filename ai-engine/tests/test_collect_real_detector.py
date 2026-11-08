"""Runs the real MediaPipe detector (through the backend's HandDetector) on the fixture photos.
This checks the recording tool's frame path. It does not test any real signer."""

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = AI_ENGINE_DIR.parent
BACKEND_DIR = REPO_DIR / "backend"
FIXTURES = BACKEND_DIR / "tests" / "fixtures"
MODEL = BACKEND_DIR / "models" / "hand_landmarker.task"
sys.path.insert(0, str(AI_ENGINE_DIR / "collection"))
sys.path.insert(0, str(BACKEND_DIR))

from app.services.hand_detection_service import HandDetector  # noqa: E402
from collect_static import detect_hands  # noqa: E402
from sample_record import accept_hands  # noqa: E402


@pytest.fixture(scope="module")
def detector():
    if not MODEL.is_file():
        pytest.skip("hand_landmarker.task is missing")
    instance = HandDetector(MODEL, max_hands=2)
    yield instance
    instance.close()


def load(name: str) -> np.ndarray:
    image = cv2.imread(str(FIXTURES / name))
    assert image is not None, name
    return image


def test_one_hand_frame_is_accepted_for_a_one_hand_class(detector) -> None:
    hands = detect_hands(detector, load("hand_thumb_up.jpg"))

    assert len(hands) == 1
    assert len(hands[0]["landmarks"]) == 21
    assert accept_hands(hands, expected_hands=1, min_score=0.8)


def test_two_hand_frame_is_rejected_for_a_one_hand_class() -> None:
    # VIDEO mode keeps tracking state, so a detector that has seen one hand may miss the second.
    # A fresh instance is used here, as in backend/tests/conftest.py.
    if not MODEL.is_file():
        pytest.skip("hand_landmarker.task is missing")
    fresh = HandDetector(MODEL, max_hands=2)
    try:
        hands = detect_hands(fresh, load("two_hands_composite.jpg"))
    finally:
        fresh.close()

    assert len(hands) == 2
    assert not accept_hands(hands, expected_hands=1, min_score=0.8)
    assert accept_hands(hands, expected_hands=2, min_score=0.5)


def test_blank_frame_is_rejected(detector) -> None:
    blank = np.full((480, 640, 3), 137, dtype=np.uint8)

    hands = detect_hands(detector, blank)

    assert hands == []
    assert not accept_hands(hands, expected_hands=1, min_score=0.8)
