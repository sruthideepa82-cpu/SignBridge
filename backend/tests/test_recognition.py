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
from app.api.recognition import combine_hand_predictions
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.hand_detection_service import HandDetector
from app.services.landmark_features import normalize_hand
from app.services.recognition_service import Prediction, StaticRecognizer
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


def test_endpoint_reports_no_model_while_camera_runs(
    settings: Settings,
    camera_service: CameraService,
    tmp_path: Path,
) -> None:
    # Points at a model file that does not exist, so the result does not depend on what is installed locally.
    missing_model = settings.model_copy(update={"recognition_model_path": tmp_path / "missing.joblib"})
    with TestClient(create_app(settings=missing_model, camera_service=camera_service)) as client:
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


def test_endpoint_classifies_two_detected_hands_instead_of_refusing(
    settings: Settings,
    hand_detector_factory: Callable[[], HandDetector],
    tmp_path: Path,
) -> None:
    model_path = tmp_path / "model.joblib"
    write_synthetic_model(model_path)
    recognition_settings = settings.model_copy(
        update={"recognition_model_path": model_path, "recognition_threshold": 0.0}
    )
    capture = ToggleCapture(load_fixture_image("two_hands_composite.jpg"), blank_frame())
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
            if body["status"] in {"recognized", "uncertain"}:
                break
        client.post("/api/camera/stop")
    service.shutdown()

    assert body["status"] in {"recognized", "uncertain"}
    assert body["status"] != "two_hands"


BASE = {"threshold": 0.7, "frame_sequence": 1, "experimental": True, "verification": "unverified_dataset"}


def accepted(label: str, confidence: float) -> Prediction:
    return Prediction(label=label, confidence=confidence, accepted=True)


def rejected(label: str, confidence: float) -> Prediction:
    return Prediction(label=None, confidence=confidence, accepted=False)


def test_two_hands_recognize_the_only_accepted_letter() -> None:
    body = combine_hand_predictions([accepted("C", 0.9), rejected("W", 0.4)], [], BASE)

    assert body.status == "recognized"
    assert body.label == "C"
    assert body.confidence == 0.9


def test_two_hands_that_agree_return_the_most_confident_hand() -> None:
    body = combine_hand_predictions([accepted("C", 0.75), accepted("C", 0.9)], [], BASE)

    assert body.status == "recognized"
    assert body.label == "C"
    assert body.confidence == 0.9


def test_two_hands_with_different_accepted_letters_are_uncertain() -> None:
    body = combine_hand_predictions([accepted("C", 0.9), accepted("W", 0.85)], [], BASE)

    assert body.status == "uncertain"
    assert body.label is None
    assert "different letters" in body.detail


def test_two_hands_below_threshold_are_uncertain_without_a_letter() -> None:
    body = combine_hand_predictions([rejected("C", 0.66), rejected("W", 0.5)], [], BASE)

    assert body.status == "uncertain"
    assert body.label is None
    assert body.confidence == 0.66


def test_a_degenerate_hand_is_ignored_when_the_other_hand_is_usable() -> None:
    body = combine_hand_predictions([accepted("C", 0.9)], ["Hand is too small"], BASE)

    assert body.status == "recognized"
    assert body.label == "C"


def test_no_usable_hand_is_uncertain_with_the_reason() -> None:
    body = combine_hand_predictions([], ["Hand is too small or degenerate to normalize."], BASE)

    assert body.status == "uncertain"
    assert body.detail == "Hand is too small or degenerate to normalize."
