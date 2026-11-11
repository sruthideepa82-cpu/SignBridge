import time
from collections.abc import Callable, Iterator

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.face_detection_service import DetectedFace, FaceDetectionResult
from tests.conftest import FakeCapture

SMILE = {"mouthSmileLeft": 0.8, "mouthSmileRight": 0.8}


class FakeFaceDetector:
    """Returns a fixed face with fixed blendshapes, so the API flow can be tested without the model."""

    def __init__(self, blendshapes: dict[str, float] | None, fail: bool = False) -> None:
        self._blendshapes = blendshapes
        self._fail = fail
        self.closed = False

    def detect(self, _frame: np.ndarray) -> FaceDetectionResult:
        if self._fail:
            raise RuntimeError("inference failed")
        if self._blendshapes is None:
            return FaceDetectionResult(faces=())
        face = DetectedFace(
            landmark_count=478,
            bbox=(0.2, 0.2, 0.8, 0.8),
            points=((0.5, 0.5),),
            blendshapes=dict(self._blendshapes),
        )
        return FaceDetectionResult(faces=(face,))

    def annotate(self, frame: np.ndarray, _result: FaceDetectionResult) -> np.ndarray:
        return frame

    def close(self) -> None:
        self.closed = True


def wait_for(read: Callable[[], dict], predicate: Callable[[dict], bool], timeout: float = 3.0) -> dict:
    deadline = time.monotonic() + timeout
    body = read()
    while time.monotonic() < deadline and not predicate(body):
        time.sleep(0.02)
        body = read()
    return body


@pytest.fixture
def make_client(settings: Settings, make_capture) -> Iterator[Callable[..., TestClient]]:
    clients: list[TestClient] = []

    def build(face_factory=None) -> TestClient:
        service = CameraService(
            settings,
            capture_factory=lambda _index: make_capture(),
            face_detector_factory=face_factory,
        )
        app = create_app(settings=settings, camera_service=service)
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        return client

    yield build
    for client in clients:
        client.__exit__(None, None, None)


def test_face_endpoint_reports_camera_off_before_start(make_client) -> None:
    client = make_client(lambda: FakeFaceDetector(SMILE))

    body = client.get("/api/face/latest").json()

    assert body["status"] == "camera_off"
    assert body["expression"] is None


def test_face_endpoint_reports_detection_unavailable_without_a_model(make_client) -> None:
    client = make_client(None)
    client.post("/api/camera/start")

    body = client.get("/api/face/latest").json()

    assert body["status"] == "detection_unavailable"
    assert body["detection_available"] is False
    assert body["expression"] is None


def test_face_endpoint_reports_a_smile_from_the_running_camera(make_client) -> None:
    client = make_client(lambda: FakeFaceDetector(SMILE))
    client.post("/api/camera/start")

    body = wait_for(
        lambda: client.get("/api/face/latest").json(),
        lambda item: item["status"] == "face_detected",
    )

    assert body["status"] == "face_detected"
    assert body["face_count"] == 1
    assert body["landmark_count"] == 478
    assert body["expression"] == "Happy"
    assert body["strength"] == 0.8
    assert body["scores"]["Happy"] == 0.8
    assert body["frames_smoothed"] >= 1


def test_face_endpoint_reports_no_face_when_the_detector_finds_none(make_client) -> None:
    client = make_client(lambda: FakeFaceDetector(None))
    client.post("/api/camera/start")

    body = wait_for(
        lambda: client.get("/api/face/latest").json(),
        lambda item: item["status"] == "no_face",
    )

    assert body["status"] == "no_face"
    assert body["expression"] is None


def test_a_face_failure_is_reported_and_does_not_stop_the_camera(make_client) -> None:
    client = make_client(lambda: FakeFaceDetector(SMILE, fail=True))
    client.post("/api/camera/start")

    body = wait_for(
        lambda: client.get("/api/face/latest").json(),
        lambda item: item["status"] == "processing_error",
    )

    assert body["status"] == "processing_error"
    assert "Facial tracking failed" in body["detection_error"]
    assert client.get("/api/camera/status").json()["running"] is True


def test_stopping_the_camera_clears_the_face_result(make_client) -> None:
    client = make_client(lambda: FakeFaceDetector(SMILE))
    client.post("/api/camera/start")
    wait_for(lambda: client.get("/api/face/latest").json(), lambda item: item["status"] == "face_detected")

    client.post("/api/camera/stop")
    body = client.get("/api/face/latest").json()

    assert body["status"] == "camera_off"
    assert body["expression"] is None
    assert body["face_count"] == 0


def test_restarting_the_camera_starts_a_fresh_expression(make_client) -> None:
    client = make_client(lambda: FakeFaceDetector(SMILE))
    client.post("/api/camera/start")
    wait_for(lambda: client.get("/api/face/latest").json(), lambda item: item["status"] == "face_detected")
    client.post("/api/camera/stop")

    client.post("/api/camera/start")
    body = wait_for(lambda: client.get("/api/face/latest").json(), lambda item: item["status"] == "face_detected")

    assert body["frames_smoothed"] <= body["frame_sequence"]
    assert body["expression"] == "Happy"


def test_real_model_runs_inside_the_camera_loop_on_a_photo(settings: Settings) -> None:
    from app.core.config import BACKEND_DIR
    from app.services.face_detection_service import FaceDetector
    from tests.conftest import load_fixture_image

    model_path = BACKEND_DIR / "models" / "face_landmarker.task"
    if not model_path.is_file():
        pytest.skip("face_landmarker.task is missing; run `python scripts/download_models.py`")
    photo = load_fixture_image("face/grace_hopper.jpg")

    class PhotoCapture(FakeCapture):
        def read(self):
            return True, photo.copy()

    service = CameraService(
        settings,
        capture_factory=lambda _index: PhotoCapture(),
        face_detector_factory=lambda: FaceDetector(model_path),
    )
    app = create_app(settings=settings, camera_service=service)
    with TestClient(app) as client:
        client.post("/api/camera/start")
        body = wait_for(
            lambda: client.get("/api/face/latest").json(),
            lambda item: item["status"] == "face_detected",
            timeout=20.0,
        )

    assert body["status"] == "face_detected"
    assert body["landmark_count"] == 478
    assert body["expression"] == "Neutral"
