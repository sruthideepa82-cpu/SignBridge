"""The static model bundle contract read by StaticRecognizer. Synthetic models only; nothing here is shipped."""

from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
from fastapi.testclient import TestClient
from sklearn.linear_model import LogisticRegression

from app.core.config import Settings
from app.main import create_app
from app.services.hand_detection_service import DetectedHand, LandmarkPoint
from app.services.recognition_service import StaticRecognizer


def fitted_model():
    rng = np.random.default_rng(0)
    X = np.vstack([rng.normal(0, 0.1, (40, 63)), rng.normal(1, 0.1, (40, 63))])
    y = ["A"] * 40 + ["B"] * 40
    return LogisticRegression(max_iter=500).fit(X, y)


def write_bundle(path: Path, **overrides) -> None:
    bundle = {"model": fitted_model(), "labels": ["A", "B"], "feature_count": 63, "version": 1}
    bundle.update(overrides)
    joblib.dump(bundle, path)


def test_wrong_feature_count_is_refused(tmp_path):
    path = tmp_path / "m.joblib"
    write_bundle(path, feature_count=126)

    recognizer = StaticRecognizer(path, threshold=0.5)

    assert recognizer.available is False
    assert "expects 126 features" in recognizer.error


def test_labels_out_of_class_order_are_refused(tmp_path):
    path = tmp_path / "m.joblib"
    write_bundle(path, labels=["B", "A"])

    recognizer = StaticRecognizer(path, threshold=0.5)

    assert recognizer.available is False
    assert "class order" in recognizer.error


def test_a_bundle_without_verification_keys_is_treated_as_experimental(tmp_path):
    path = tmp_path / "m.joblib"
    write_bundle(path)

    recognizer = StaticRecognizer(path, threshold=0.5)

    assert recognizer.available is True
    assert recognizer.experimental is True
    assert recognizer.verification == "unverified"


def test_a_public_data_bundle_reports_its_unverified_status(tmp_path):
    path = tmp_path / "m.joblib"
    write_bundle(path, verification="unverified_dataset", experimental=True)

    recognizer = StaticRecognizer(path, threshold=0.5)

    assert recognizer.verification == "unverified_dataset"
    assert recognizer.experimental is True


@dataclass
class FakeSnapshot:
    running: bool = True
    frame_sequence: int = 1
    hands: tuple = field(default_factory=tuple)


class FakeCamera:
    def __init__(self, hands):
        self._hands = hands

    def landmark_snapshot(self):
        return FakeSnapshot(hands=self._hands)


def hand_at(seed: int) -> DetectedHand:
    rng = np.random.default_rng(seed)
    points = rng.normal(0.5, 0.05, (21, 3))
    landmarks = tuple(LandmarkPoint(index=i, name=f"P{i}", x=float(p[0]), y=float(p[1]), z=float(p[2]))
                      for i, p in enumerate(points))
    return DetectedHand(handedness="Right", score=0.9, landmarks=landmarks)


def test_latest_recognition_marks_the_predicted_letter_as_experimental(tmp_path):
    path = tmp_path / "static_classifier.joblib"
    write_bundle(path, verification="unverified_dataset", experimental=True)
    settings = Settings(recognition_model_path=path, recognition_threshold=0.0)
    client = TestClient(create_app(settings, camera_service=FakeCamera((hand_at(1),))))

    body = client.get("/api/recognition/latest").json()

    assert body["status"] in {"recognized", "uncertain"}
    assert body["experimental"] is True
    assert body["verification"] == "unverified_dataset"
    if body["status"] == "recognized":
        assert body["label"] in {"A", "B"}


def test_latest_recognition_without_a_model_reports_no_verification_state(tmp_path):
    settings = Settings(recognition_model_path=tmp_path / "missing.joblib", recognition_threshold=0.5)
    client = TestClient(create_app(settings, camera_service=FakeCamera((hand_at(2),))))

    body = client.get("/api/recognition/latest").json()

    assert body["status"] == "no_model"
    assert body["experimental"] is None
    assert body["verification"] is None
