import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_defaults_are_valid() -> None:
    settings = Settings(_env_file=None)

    assert settings.camera_fps == 30
    assert settings.hand_max_hands == 2


@pytest.mark.parametrize(
    "overrides",
    [
        {"camera_fps": 0},
        {"camera_fps": 500},
        {"camera_jpeg_quality": 0},
        {"camera_jpeg_quality": 101},
        {"camera_width": 0},
        {"camera_max_read_failures": 0},
        {"camera_index": -1},
        {"hand_max_hands": 0},
        {"hand_max_hands": 3},
        {"hand_min_detection_confidence": -0.1},
        {"hand_min_presence_confidence": 1.5},
        {"hand_min_tracking_confidence": 2.0},
    ],
)
def test_out_of_range_values_are_rejected(overrides: dict) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)
