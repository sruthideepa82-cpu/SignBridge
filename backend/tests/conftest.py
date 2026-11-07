from collections.abc import Callable, Iterator
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_DIR, Settings
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.hand_detection_service import HandDetector

FIXTURES_DIR = Path(__file__).parent / "fixtures"
HAND_MODEL_PATH = BACKEND_DIR / "models" / "hand_landmarker.task"


class FakeCapture:
    """Stands in for cv2.VideoCapture so tests never touch real hardware."""

    def __init__(self, opened: bool = True, reads_before_failure: int | None = None) -> None:
        self._opened = opened
        self._reads_before_failure = reads_before_failure
        self._reads = 0
        self.released = False

    def isOpened(self) -> bool:
        return self._opened

    def set(self, _prop: int, _value: float) -> bool:
        return True

    def read(self) -> tuple[bool, np.ndarray | None]:
        self._reads += 1
        if self._reads_before_failure is not None and self._reads > self._reads_before_failure:
            return False, None
        frame = np.full((48, 64, 3), fill_value=(self._reads * 7) % 255, dtype=np.uint8)
        return True, frame

    def release(self) -> None:
        self.released = True


class ToggleCapture:
    """Returns `shown` frames while `show_primary` is True, otherwise `hidden` frames.

    Lets a test make a hand appear and disappear in front of the real detector.
    """

    def __init__(self, primary: np.ndarray, hidden: np.ndarray) -> None:
        self._primary = primary
        self._hidden = hidden
        self.show_primary = True
        self.released = False

    def isOpened(self) -> bool:
        return True

    def set(self, _prop: int, _value: float) -> bool:
        return True

    def read(self) -> tuple[bool, np.ndarray]:
        return True, (self._primary if self.show_primary else self._hidden).copy()

    def release(self) -> None:
        self.released = True


def load_fixture_image(name: str) -> np.ndarray:
    path = FIXTURES_DIR / name
    if not path.is_file():
        pytest.skip(f"Fixture {name} is missing")
    image = cv2.imread(str(path))
    assert image is not None, f"Could not decode fixture {name}"
    return image


def blank_frame(height: int = 480, width: int = 640) -> np.ndarray:
    return np.full((height, width, 3), 137, dtype=np.uint8)


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        camera_fps=120,
        camera_max_read_failures=3,
        cors_origins=["http://localhost:5173"],
        hand_detection_enabled=False,
    )


@pytest.fixture
def capture_log() -> list[FakeCapture]:
    return []


@pytest.fixture
def make_capture(capture_log: list[FakeCapture]) -> Callable[..., FakeCapture]:
    def factory(**kwargs: object) -> FakeCapture:
        capture = FakeCapture(**kwargs)
        capture_log.append(capture)
        return capture

    return factory


@pytest.fixture
def camera_service(settings: Settings, make_capture: Callable[..., FakeCapture]) -> Iterator[CameraService]:
    service = CameraService(settings, capture_factory=lambda _index: make_capture())
    yield service
    service.shutdown()


@pytest.fixture
def client(settings: Settings, camera_service: CameraService) -> Iterator[TestClient]:
    app = create_app(settings=settings, camera_service=camera_service)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def hand_detector() -> Iterator[HandDetector]:
    if not HAND_MODEL_PATH.is_file():
        pytest.skip("hand_landmarker.task is missing; run `python scripts/download_models.py`")
    detector = HandDetector(HAND_MODEL_PATH)
    yield detector
    detector.close()


@pytest.fixture
def hand_detector_factory() -> Callable[[], HandDetector]:
    """Each camera service gets its own detector, which the service closes on shutdown."""
    if not HAND_MODEL_PATH.is_file():
        pytest.skip("hand_landmarker.task is missing; run `python scripts/download_models.py`")
    return lambda: HandDetector(HAND_MODEL_PATH)


@pytest.fixture
def fresh_hand_detector() -> Iterator[HandDetector]:
    """A detector with no tracking history. VIDEO mode carries state between frames,
    so checks that expect a specific number of hands use a new instance."""
    if not HAND_MODEL_PATH.is_file():
        pytest.skip("hand_landmarker.task is missing; run `python scripts/download_models.py`")
    detector = HandDetector(HAND_MODEL_PATH)
    yield detector
    detector.close()
