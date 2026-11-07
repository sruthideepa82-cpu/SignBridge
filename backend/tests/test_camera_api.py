import threading

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.camera_service import CameraService


def test_status_reports_camera_idle(client: TestClient) -> None:
    response = client.get("/api/camera/status")

    assert response.status_code == 200
    body = response.json()
    assert body["running"] is False
    assert body["camera_index"] == 0
    assert body["width"] == 640
    assert body["height"] == 480
    assert body["last_error"] is None


def test_start_and_stop_endpoints_toggle_running_state(client: TestClient) -> None:
    started = client.post("/api/camera/start")
    assert started.status_code == 200
    assert started.json()["running"] is True

    stopped = client.post("/api/camera/stop")
    assert stopped.status_code == 200
    assert stopped.json()["running"] is False


def test_stream_requires_running_camera(client: TestClient) -> None:
    response = client.get("/api/camera/stream")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "camera_not_running"


def test_stream_returns_mjpeg_with_no_cache_headers(
    client: TestClient, camera_service: CameraService
) -> None:
    client.post("/api/camera/start")
    # TestClient buffers the whole body, so stop the camera to end the stream.
    stopper = threading.Timer(0.3, camera_service.stop)
    stopper.start()

    response = client.get("/api/camera/stream")
    stopper.join()

    assert response.status_code == 200
    assert response.headers["content-type"] == "multipart/x-mixed-replace; boundary=frame"
    assert "no-cache" in response.headers["cache-control"]
    assert response.headers["pragma"] == "no-cache"
    assert b"--frame\r\nContent-Type: image/jpeg" in response.content


def test_start_failure_returns_503_error_payload(
    settings: Settings, make_capture
) -> None:
    failing_service = CameraService(
        settings,
        capture_factory=lambda _index: make_capture(opened=False),
    )
    app = create_app(settings=settings, camera_service=failing_service)

    with TestClient(app) as failing_client:
        response = failing_client.post("/api/camera/start")

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "camera_unavailable"
    assert "could not be opened" in body["error"]["message"]
