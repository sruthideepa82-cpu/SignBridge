import time

from app.core.config import Settings
from app.services.camera_service import HAND_HISTORY_FRAMES, CameraService
from app.services.hand_detection_service import DetectedHand, HandDetectionResult, LandmarkPoint
from tests.conftest import ToggleCapture, blank_frame


def hand() -> DetectedHand:
    points = tuple(LandmarkPoint(index=i, name=f"P{i}", x=0.4, y=0.5, z=0.0) for i in range(21))
    return DetectedHand(handedness="Left", score=0.9, landmarks=points)


class AlternatingDetector:
    """Finds a hand on every other frame, so the history holds both hands and empty frames."""

    def __init__(self) -> None:
        self.calls = 0

    def detect(self, _frame) -> HandDetectionResult:
        self.calls += 1
        return HandDetectionResult(hands=(hand(),) if self.calls % 2 else ())

    def annotate(self, frame, _result):
        return frame

    def close(self) -> None:
        pass


def wait_until(predicate, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError("timed out")


def test_history_keeps_processed_frames_in_order_and_resets_on_restart(settings: Settings) -> None:
    capture = ToggleCapture(blank_frame(), blank_frame())
    service = CameraService(
        settings,
        capture_factory=lambda _index: capture,
        detector_factory=AlternatingDetector,
    )
    try:
        service.start()
        wait_until(lambda: len(service.hand_history(HAND_HISTORY_FRAMES)) >= 6)
        history = service.hand_history(6)
        sequences = [sequence for sequence, _ in history]

        assert sequences == sorted(sequences)
        assert len(set(sequences)) == len(sequences)
        assert any(len(hands) == 1 for _, hands in history)
        assert any(len(hands) == 0 for _, hands in history)
        assert len(service.hand_history(HAND_HISTORY_FRAMES * 2)) <= HAND_HISTORY_FRAMES

        service.stop()
        assert service.hand_history(6) == ()
    finally:
        service.shutdown()
