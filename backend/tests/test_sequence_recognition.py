"""Temporal sign recognition tests.

The models here are trained on synthetic landmark motion inside the test, only to exercise the code paths.
They are never written to the repository and say nothing about real sign accuracy.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestClassifier

from app.core.config import BACKEND_DIR, Settings
from app.main import create_app
from app.services.hand_detection_service import DetectedHand, LandmarkPoint
from app.services.sequence_recognizer import SequenceRecognizer, build_window, load_feature_module

CODE_DIR = BACKEND_DIR.parent / "signbridge_training"
WINDOW = load_feature_module(CODE_DIR).WINDOW_FRAMES


def hand(handedness: str, wrist_x: float, seed: int) -> DetectedHand:
    rng = np.random.default_rng(seed)
    points = rng.normal(0.0, 0.02, size=(21, 3)) + 0.5
    points[0] = [wrist_x, 0.5, 0.0]
    landmarks = tuple(
        LandmarkPoint(index=i, name=f"p{i}", x=float(p[0]), y=float(p[1]), z=float(p[2]))
        for i, p in enumerate(points)
    )
    return DetectedHand(handedness=handedness, score=0.9, landmarks=landmarks)


def clip(label: str, seed: int) -> list[tuple[DetectedHand, ...]]:
    """A 32-frame clip. Class 'A' moves the right hand left to right, class 'B' the other way."""
    frames = []
    for t in range(WINDOW):
        progress = t / (WINDOW - 1)
        wrist_x = 0.2 + 0.6 * progress if label == "A" else 0.8 - 0.6 * progress
        frames.append((hand("Right", wrist_x, seed * 1000 + t),))
    return frames


def train_synthetic_model(directory: Path, *, synthetic: bool = True, frames: int = WINDOW) -> None:
    module = load_feature_module(CODE_DIR)
    clips, labels = [], []
    for seed in range(20):
        for label in ("A", "B"):
            window, _ = build_window(clip(label, seed))
            clips.append(window)
            labels.append(label)
    X = np.stack(clips)
    y = np.array([["A", "B"].index(label) for label in labels])
    model = RandomForestClassifier(n_estimators=40, random_state=0).fit(module.features(X), y)
    directory.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, directory / "model.joblib")
    card = {
        "classes": ["A", "B"],
        "frames": frames,
        "signer_independent": False,
        "caveat": "Synthetic test model.",
        "synthetic": synthetic,
    }
    (directory / "model_card.json").write_text(json.dumps(card), encoding="utf-8")


# ---------- window layout ----------

def test_window_puts_left_and_right_hands_in_their_slots() -> None:
    frames = [(hand("Right", 0.3, 1), hand("Left", 0.7, 2)), ()]

    window, hand_frames = build_window(frames)

    assert window.shape == (2, 2, 21, 3)
    assert window[0, 0, 0, 0] == pytest.approx(0.7)  # Left hand in slot 0
    assert window[0, 1, 0, 0] == pytest.approx(0.3)  # Right hand in slot 1
    assert not window[1].any()                       # a frame with no hands stays zero
    assert hand_frames == 1


# ---------- loading ----------

def test_missing_model_is_reported_not_guessed(tmp_path: Path) -> None:
    recognizer = SequenceRecognizer(tmp_path, threshold=0.5, code_dir=CODE_DIR)

    assert recognizer.available is False
    assert "No trained sign model" in recognizer.error


def test_synthetic_model_is_refused_unless_explicitly_allowed(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path)

    assert SequenceRecognizer(tmp_path, 0.5, CODE_DIR).available is False
    assert "synthetic" in SequenceRecognizer(tmp_path, 0.5, CODE_DIR).error
    assert SequenceRecognizer(tmp_path, 0.5, CODE_DIR, allow_synthetic=True).available is True


def test_model_with_mismatched_frame_count_is_refused(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path, frames=16)

    recognizer = SequenceRecognizer(tmp_path, 0.5, CODE_DIR, allow_synthetic=True)

    assert recognizer.available is False
    assert "expects 16 frames" in recognizer.error


# ---------- prediction ----------

def test_recognises_a_moving_sign_from_a_full_window(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path)
    recognizer = SequenceRecognizer(tmp_path, 0.5, CODE_DIR, allow_synthetic=True)

    window, _ = build_window(clip("A", seed=99))
    prediction = recognizer.predict(window)

    assert prediction.status == "recognized"
    assert prediction.word == "A"
    assert prediction.confidence >= 0.5
    assert [item.word for item in prediction.top3][0] == "A"


def test_threshold_decides_whether_a_word_is_returned(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path)
    window, _ = build_window(clip("B", seed=77))

    prediction = SequenceRecognizer(tmp_path, 1.0, CODE_DIR, allow_synthetic=True).predict(window)

    assert prediction.word is None or prediction.confidence >= 1.0
    if prediction.confidence < 1.0:
        assert prediction.status == "uncertain"


def test_rejects_a_window_of_the_wrong_shape(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path)
    recognizer = SequenceRecognizer(tmp_path, 0.5, CODE_DIR, allow_synthetic=True)

    with pytest.raises(ValueError):
        recognizer.predict(np.zeros((5, 2, 21, 3), np.float32))


# ---------- endpoint ----------

@dataclass
class FakeSnapshot:
    running: bool = True
    detection_available: bool = True
    detection_error: str | None = None
    frame_sequence: int = 1


@dataclass
class FakeCamera:
    """Stands in for the camera service so the endpoint can be tested without hardware."""

    snapshot: FakeSnapshot = field(default_factory=FakeSnapshot)
    history: tuple = ()

    def landmark_snapshot(self) -> FakeSnapshot:
        return self.snapshot

    def hand_history(self, count: int) -> tuple:
        return tuple(self.history[-count:]) if count > 0 else ()


def client_for(camera: FakeCamera, model_dir: Path, *, allow_synthetic: bool) -> TestClient:
    settings = Settings(sequence_model_dir=model_dir, sequence_code_dir=CODE_DIR, sequence_threshold=0.5)
    app = create_app(settings, camera_service=camera)
    if allow_synthetic:
        app.state.sequence_recognizer = SequenceRecognizer(model_dir, 0.5, CODE_DIR, allow_synthetic=True)
    return TestClient(app)


def numbered(clip_frames: list[tuple[DetectedHand, ...]]) -> tuple:
    return tuple((i + 1, hands) for i, hands in enumerate(clip_frames))


def test_endpoint_reports_camera_off() -> None:
    camera = FakeCamera(snapshot=FakeSnapshot(running=False))
    body = client_for(camera, Path("/nowhere"), allow_synthetic=False).get("/api/recognition/sequence").json()

    assert body["status"] == "camera_off"
    assert body["word"] is None


def test_endpoint_reports_missing_model_without_a_word(tmp_path: Path) -> None:
    camera = FakeCamera(history=numbered(clip("A", 1)))
    body = client_for(camera, tmp_path, allow_synthetic=False).get("/api/recognition/sequence").json()

    assert body["status"] == "no_model"
    assert body["word"] is None
    assert "No trained sign model" in body["detail"]


def test_endpoint_reports_hand_detection_unavailable(tmp_path: Path) -> None:
    camera = FakeCamera(snapshot=FakeSnapshot(detection_available=False, detection_error="off"))
    body = client_for(camera, tmp_path, allow_synthetic=False).get("/api/recognition/sequence").json()

    assert body["status"] == "detection_unavailable"


def test_endpoint_waits_until_the_window_is_full(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path)
    camera = FakeCamera(history=numbered(clip("A", 1))[:5])
    body = client_for(camera, tmp_path, allow_synthetic=True).get("/api/recognition/sequence").json()

    assert body["status"] == "warming_up"
    assert body["collected_frames"] == 5


def test_endpoint_reports_no_hand_when_the_window_is_empty(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path)
    camera = FakeCamera(history=tuple((i + 1, ()) for i in range(WINDOW)))
    body = client_for(camera, tmp_path, allow_synthetic=True).get("/api/recognition/sequence").json()

    assert body["status"] == "no_hand"
    assert body["hand_frames"] == 0


def test_endpoint_recognises_a_word_end_to_end(tmp_path: Path) -> None:
    train_synthetic_model(tmp_path)
    camera = FakeCamera(history=numbered(clip("B", 5)))
    body = client_for(camera, tmp_path, allow_synthetic=True).get("/api/recognition/sequence").json()

    assert body["status"] == "recognized"
    assert body["word"] == "B"
    assert body["collected_frames"] == WINDOW
    assert body["hand_frames"] == WINDOW
    assert body["caveat"] == "Synthetic test model."
