import threading
import time
from collections.abc import Callable

import pytest

from app.core.config import Settings
from app.core.exceptions import CameraUnavailableError
from app.services.camera_service import CameraService, mjpeg_part
from tests.conftest import FakeCapture


def wait_until(predicate: Callable[[], bool], timeout: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def test_status_is_idle_before_start(camera_service: CameraService) -> None:
    status = camera_service.status()

    assert status.running is False
    assert status.last_error is None


def test_start_opens_camera_and_stop_releases_it(
    camera_service: CameraService, capture_log: list[FakeCapture]
) -> None:
    camera_service.start()

    assert camera_service.is_running is True
    assert len(capture_log) == 1

    camera_service.stop()

    assert camera_service.is_running is False
    assert capture_log[0].released is True


def test_repeated_start_does_not_open_second_camera(
    camera_service: CameraService, capture_log: list[FakeCapture]
) -> None:
    camera_service.start()
    camera_service.start()

    assert len(capture_log) == 1
    camera_service.stop()


def test_stop_without_start_is_safe(camera_service: CameraService) -> None:
    status = camera_service.stop()

    assert status.running is False


def test_unopenable_camera_raises_unavailable(settings: Settings, make_capture) -> None:
    service = CameraService(settings, capture_factory=lambda _index: make_capture(opened=False))

    with pytest.raises(CameraUnavailableError, match="could not be opened"):
        service.start()
    assert service.is_running is False


def test_camera_without_frames_raises_unavailable(settings: Settings, make_capture) -> None:
    service = CameraService(
        settings,
        capture_factory=lambda _index: make_capture(reads_before_failure=0),
    )

    with pytest.raises(CameraUnavailableError, match="did not deliver any frames"):
        service.start()


def test_stream_yields_jpeg_frames_while_running(camera_service: CameraService) -> None:
    camera_service.start()
    frames = camera_service.iter_mjpeg_frames()

    first_part = next(frames)

    assert first_part.startswith(b"--frame\r\nContent-Type: image/jpeg\r\n")
    assert b"\xff\xd8" in first_part  # JPEG start-of-image marker
    camera_service.stop()


def test_stream_ends_when_camera_stops(camera_service: CameraService) -> None:
    camera_service.start()
    frames = camera_service.iter_mjpeg_frames()
    next(frames)

    camera_service.stop()

    remaining = list(frames)

    assert camera_service.is_running is False
    assert len(remaining) <= 1


def test_read_failures_mark_camera_as_stopped_with_error(
    settings: Settings, make_capture
) -> None:
    service = CameraService(
        settings,
        capture_factory=lambda _index: make_capture(reads_before_failure=5),
    )
    service.start()

    assert wait_until(lambda: service.is_running is False)
    status = service.status()
    assert status.running is False
    assert status.last_error is not None
    assert "stopped delivering frames" in status.last_error
    service.stop()


class HungCapture(FakeCapture):
    """Blocks inside read() after the first frame, like a driver that stops responding."""

    def __init__(self) -> None:
        super().__init__()
        self.release_event = threading.Event()

    def read(self):
        if self._reads >= 1:
            self.release_event.wait(10)
        return super().read()


class ClosableDetector:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


def test_shutdown_keeps_detector_open_while_capture_thread_is_stuck(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.camera_service.STOP_JOIN_TIMEOUT_SECONDS", 0.1)
    capture = HungCapture()
    detector = ClosableDetector()
    service = CameraService(
        settings,
        capture_factory=lambda _index: capture,
        detector_factory=lambda: detector,
    )
    service.start()

    service.shutdown()

    assert detector.closed is False

    capture.release_event.set()
    assert wait_until(lambda: not any(t.is_alive() for t in service._threads))
    service.shutdown()

    assert detector.closed is True


def test_mjpeg_part_contains_correct_content_length() -> None:
    payload = b"\xff\xd8test\xff\xd9"

    part = mjpeg_part(payload)

    assert f"Content-Length: {len(payload)}".encode() in part
    assert part.endswith(payload + b"\r\n")
