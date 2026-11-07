"""Integration tests that use the real webcam through OpenCV.

These start a real Uvicorn server so the MJPEG stream is read over HTTP exactly
as the browser reads it. Run with:

    SIGNBRIDGE_RUN_CAMERA_TESTS=1 python -m pytest -m hardware
"""

import os
import socket
import threading
import time
from collections.abc import Iterator

import httpx
import pytest
import uvicorn

from app.core.config import Settings
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.hand_detection_service import create_hand_detector_factory

pytestmark = [
    pytest.mark.hardware,
    pytest.mark.skipif(
        os.environ.get("SIGNBRIDGE_RUN_CAMERA_TESTS") != "1",
        reason="Set SIGNBRIDGE_RUN_CAMERA_TESTS=1 to run webcam tests.",
    ),
]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def base_url() -> Iterator[str]:
    settings = Settings(_env_file=None, cors_origins=["http://localhost:5173"])
    camera = CameraService(settings, detector_factory=create_hand_detector_factory(settings))
    app = create_app(settings=settings, camera_service=camera)
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    assert server.started, "uvicorn did not start"

    yield f"http://127.0.0.1:{port}"

    camera.shutdown()
    server.should_exit = True
    thread.join(timeout=10)


def test_real_webcam_streams_jpeg_frames(base_url: str) -> None:
    with httpx.Client(base_url=base_url, timeout=10) as client:
        start = client.post("/api/camera/start")
        assert start.status_code == 200, start.text
        assert start.json()["running"] is True

        with client.stream("GET", "/api/camera/stream") as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("multipart/x-mixed-replace")
            received = bytearray()
            for chunk in response.iter_bytes():
                received.extend(chunk)
                if b"Content-Type: image/jpeg" in received and b"\xff\xd9" in received:
                    break

        assert b"Content-Type: image/jpeg" in received
        assert b"\xff\xd8" in received, "expected a JPEG start marker"

        client.post("/api/camera/stop")


def test_stopping_real_webcam_releases_device(base_url: str) -> None:
    with httpx.Client(base_url=base_url, timeout=10) as client:
        assert client.post("/api/camera/start").status_code == 200

        stop = client.post("/api/camera/stop")
        assert stop.status_code == 200
        assert stop.json()["running"] is False

        restart = client.post("/api/camera/start")
        assert restart.status_code == 200, "camera should reopen after it was released"
        client.post("/api/camera/stop")


def test_real_webcam_reports_hand_landmark_status(base_url: str) -> None:
    with httpx.Client(base_url=base_url, timeout=30) as client:
        assert client.post("/api/camera/start").status_code == 200

        deadline = time.monotonic() + 15
        body = {}
        while time.monotonic() < deadline:
            body = client.get("/api/camera/landmarks").json()
            if body["frame_sequence"] > 0:
                break
            time.sleep(0.1)

        client.post("/api/camera/stop")

    assert body["detection_available"] is True, body.get("detection_error")
    assert body["frame_sequence"] > 0
    assert body["status"] in {"hand_detected", "no_hand"}
    assert body["hand_count"] == len(body["hands"])