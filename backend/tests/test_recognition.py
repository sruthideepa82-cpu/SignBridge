"""Recognition tests. The models here are trained on synthetic features only to exercise the code paths.
They say nothing about real sign accuracy."""

from collections.abc import Callable
from pathlib import Path

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestClassifier

from app.core.config import Settings
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.hand_detection_service import HandDetector
from app.services.landmark_features import normalize_hand
from app.services.recognition_service import StaticRecognizer
from tests.conftest import ToggleCapture, blank_frame, load_fixture_image


def synthetic_hand(seed: int, spread: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    points = rng.normal(0.0, 1.0, size=(21, 3)) * spread
    points[:, 2] *= 0.1
    return points + 0.5


def write_synthetic_model(path: Path) -> None:
    features, labels = [], []
    for seed in range(30):
        features.append(normalize_hand(synthetic_hand(seed, spread=0.05)))
        labels.append("A")
        features.append(normalize_hand(synthetic_hand(seed + 1000, spread=0.5)))
        labels.append("B")
    model = RandomForestClassifier(n_estimators=20, random_state=0).fit(np.vstack(features), labels)
    joblib.dump({"model": model, "labels": list(model.classes_), "feature_count": 63, "version": 1}, path)


def test_missing_model_is_reported_not_guessed(tmp_path: Path) -> None:
    recognizer = StaticRecognizer(tmp_path / "missing.joblib", threshold=0.5)

    assert recognizer.available is False
    assert "No trained model" in recognizer.error
    with pytest.raises(RuntimeError):
        recognizer.predict(synthetic_hand(1, 0.05).tolist())


def test_threshold_controls_whether_a_label_is_returned(tmp_path: Path) -> None:
    path = tmp_path / "model.joblib"
    write_synthetic_model(path)
    hand = synthetic_hand(5, spread=0.05).tolist()

    scored = StaticRecognizer(path, threshold=0.0).predict(hand)
    above = StaticRecognizer(path, threshold=min(1.0, scored.confidence + 0.01)).predict(hand)

    assert scored.accepted is True
    assert scored.label in {"A", "B"}
    if scored.confidence < 1.0:
        assert above.accepted is False
        assert above.label is None


def test_endpoint_reports_no_model_while_camera_runs(client: TestClient) -> None:
    client.post("/api/camera/start")
    body = client.get("/api/recognition/latest").json()
    client.post("/api/camera/stop")

    assert body["status"] == "no_model"
    assert body["label"] is None
    assert "No trained model" in body["detail"]


def test_endpoint_reports_camera_off(client: TestClient) -> None:
    body = client.get("/api/recognition/latest").json()

    assert body["status"] == "camera_off"
    assert body["label"] is None


def test_endpoint_classifies_a_real_detected_hand(
    settings: Settings,
    hand_detector_factory: Callable[[], HandDetector],
    tmp_path: Path,
) -> None:
    model_path = tmp_path / "model.joblib"
    write_synthetic_model(model_path)
    recognition_settings = settings.model_copy(
        update={"recognition_model_path": model_path, "recognition_threshold": 0.0}
    )
    capture = ToggleCapture(load_fixture_image("hand_thumb_up.jpg"), blank_frame())
    service = CameraService(
        recognition_settings,
        capture_factory=lambda _index: capture,
        detector_factory=hand_detector_factory,
    )
    app = create_app(settings=recognition_settings, camera_service=service)

    with TestClient(app) as client:
        client.post("/api/camera/start")
        body = {}
        for _ in range(200):
            body = client.get("/api/recognition/latest").json()
            if body["status"] == "recognized":
                break
        client.post("/api/camera/stop")
    service.shutdown()

    assert body["status"] == "recognized"
    assert body["label"] in {"A", "B"}
    assert 0.0 <= body["confidence"] <= 1.0
