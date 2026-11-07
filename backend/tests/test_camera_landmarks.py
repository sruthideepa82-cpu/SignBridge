import time
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.exceptions import HandDetectionUnavailableError
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.hand_detection_service import HandDetector
from tests.conftest import ToggleCapture, blank_frame, load_fixture_image


def wait_for_landmarks(client: TestClient, predicate: Callable[[dict], bool], timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    body: dict = {}
    while time.monotonic() < deadline:
        body = client.get("/api/camera/landmarks").json()
        if predicate(body):
            return body
        time.sleep(0.05)
    raise AssertionError(f"Timed out waiting for landmark condition; last response: {body['status']}")


@pytest.fixture
def detection_client(settings: Settings, hand_detector_factory: Callable[[], HandDetector]) -> Iterator[tuple[TestClient, ToggleCapture]]:
    capture = ToggleCapture(load_fixture_image("hand_thumb_up.jpg"), blank_frame())
    service = CameraService(
        settings,
        capture_factory=lambda _index: capture,
        detector_factory=hand_detector_factory,
    )
    app = create_app(settings=settings, camera_service=service)
    with TestClient(app) as test_client:
        yield test_client, capture
    service.shutdown()


def test_landmarks_report_camera_off_before_start(client: TestClient) -> None:
    body = client.get("/api/camera/landmarks").json()

    assert body["status"] == "camera_off"
    assert body["running"] is False
    assert body["hand_count"] == 0
    assert body["hands"] == []


def test_landmarks_report_detection_disabled_when_running(client: TestClient) -> None:
    client.post("/api/camera/start")

    body = client.get("/api/camera/landmarks").json()
    client.post("/api/camera/stop")

    assert body["status"] == "detection_unavailable"
    assert body["detection_available"] is False
    assert "disabled" in body["detection_error"]


def test_model_load_failure_is_reported_and_camera_still_streams(settings: Settings, make_capture) -> None:
    def broken_factory() -> HandDetector:
        raise HandDetectionUnavailableError("Hand model file not found at /nowhere.")

    service = CameraService(
        settings,
        capture_factory=lambda _index: make_capture(),
        detector_factory=broken_factory,
    )
    app = create_app(settings=settings, camera_service=service)

    with TestClient(app) as client:
        start = client.post("/api/camera/start")
        assert start.status_code == 200
        body = client.get("/api/camera/landmarks").json()
        client.post("/api/camera/stop")

    assert body["status"] == "detection_unavailable"
    assert body["detection_error"] == "Hand model file not found at /nowhere."


def test_hand_appears_and_removal_updates_status(detection_client) -> None:
    client, capture = detection_client
    client.post("/api/camera/start")

    detected = wait_for_landmarks(client, lambda body: body["status"] == "hand_detected")
    assert detected["hand_count"] == 1
    assert len(detected["hands"][0]["landmarks"]) == 21
    assert detected["hands"][0]["landmarks"][0]["name"] == "WRIST"

    capture.show_primary = False
    cleared = wait_for_landmarks(client, lambda body: body["status"] == "no_hand")
    assert cleared["hand_count"] == 0
    assert cleared["hands"] == []

    client.post("/api/camera/stop")
    assert capture.released is True
    assert client.get("/api/camera/landmarks").json()["status"] == "camera_off"


def test_two_hands_report_up_to_42_landmarks(settings: Settings, hand_detector_factory: Callable[[], HandDetector]) -> None:
    capture = ToggleCapture(load_fixture_image("two_hands_composite.jpg"), blank_frame())
    service = CameraService(
        settings,
        capture_factory=lambda _index: capture,
        detector_factory=hand_detector_factory,
    )
    app = create_app(settings=settings, camera_service=service)

    with TestClient(app) as client:
        client.post("/api/camera/start")
        body = wait_for_landmarks(client, lambda data: data["hand_count"] == 2)
        client.post("/api/camera/stop")

    total_landmarks = sum(len(hand["landmarks"]) for hand in body["hands"])
    assert total_landmarks == 42


def test_detection_restarts_after_stop(detection_client) -> None:
    client, _capture = detection_client
    client.post("/api/camera/start")
    wait_for_landmarks(client, lambda body: body["status"] == "hand_detected")
    client.post("/api/camera/stop")

    client.post("/api/camera/start")
    restarted = wait_for_landmarks(client, lambda body: body["status"] == "hand_detected")
    client.post("/api/camera/stop")

    assert restarted["frame_sequence"] > 0
