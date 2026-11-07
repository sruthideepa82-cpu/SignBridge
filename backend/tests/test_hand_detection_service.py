import math
from pathlib import Path

import numpy as np
import pytest

from app.core.exceptions import HandDetectionUnavailableError
from app.services.hand_detection_service import HandDetector
from tests.conftest import blank_frame, load_fixture_image


def test_missing_model_raises_unavailable(tmp_path: Path) -> None:
    with pytest.raises(HandDetectionUnavailableError, match="Hand model file not found"):
        HandDetector(tmp_path / "missing.task")


def test_blank_frame_has_no_hands(hand_detector: HandDetector) -> None:
    result = hand_detector.detect(blank_frame())

    assert result.hands == ()


def test_single_hand_produces_21_named_landmarks(hand_detector: HandDetector) -> None:
    result = hand_detector.detect(load_fixture_image("hand_thumb_up.jpg"))

    assert len(result.hands) == 1
    hand = result.hands[0]
    assert len(hand.landmarks) == 21
    assert [point.index for point in hand.landmarks] == list(range(21))
    assert hand.landmarks[0].name == "WRIST"
    assert hand.landmarks[4].name == "THUMB_TIP"
    assert hand.handedness in {"Left", "Right"}
    assert 0.0 < hand.score <= 1.0
    for point in hand.landmarks:
        assert all(math.isfinite(value) for value in (point.x, point.y, point.z))
        assert -0.1 <= point.x <= 1.1
        assert -0.1 <= point.y <= 1.1


def test_two_hands_produce_42_landmarks(fresh_hand_detector: HandDetector) -> None:
    result = fresh_hand_detector.detect(load_fixture_image("two_hands_composite.jpg"))

    assert len(result.hands) == 2
    assert sum(len(hand.landmarks) for hand in result.hands) == 42
    assert {hand.handedness for hand in result.hands} == {"Left", "Right"}


def test_annotation_draws_hand_connections(hand_detector: HandDetector) -> None:
    image = load_fixture_image("hand_thumb_up.jpg")
    result = hand_detector.detect(image)
    canvas = np.zeros_like(image)

    annotated = hand_detector.annotate(canvas, result)

    height, width = image.shape[:2]
    wrist, index_mcp = result.hands[0].landmarks[0], result.hands[0].landmarks[5]
    assert (wrist.name, index_mcp.name) == ("WRIST", "INDEX_FINGER_MCP")
    mid_x = int((wrist.x + index_mcp.x) / 2 * width)
    mid_y = int((wrist.y + index_mcp.y) / 2 * height)
    neighbourhood = annotated[mid_y - 3 : mid_y + 4, mid_x - 3 : mid_x + 4]
    assert neighbourhood.any(), "expected a drawn connection between WRIST and INDEX_FINGER_MCP"


def test_annotation_does_not_modify_source_frame(hand_detector: HandDetector) -> None:
    image = load_fixture_image("hand_thumb_up.jpg")
    original = image.copy()
    result = hand_detector.detect(image)

    annotated = hand_detector.annotate(image, result)

    assert np.array_equal(image, original)
    assert not np.array_equal(annotated, original)
