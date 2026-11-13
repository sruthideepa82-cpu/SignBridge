"""Daily-phrase recognition tests. Synthetic models exercise code paths only; they say nothing about accuracy."""

from pathlib import Path

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestClassifier

from app.core.config import Settings
from app.main import create_app
from app.services.phrase_features import PHRASE_FEATURE_CONTRACT, PHRASE_FEATURE_COUNT, build_phrase_features
from app.services.phrase_recognizer import PhraseRecognizer

REPO = Path(__file__).resolve().parents[2]
REAL_MODEL = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
REAL_LANDMARKS = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases" / "landmarks.npz"


def hand(seed: int, spread: float = 0.2) -> np.ndarray:
    rng = np.random.default_rng(seed)
    points = rng.normal(0.0, 1.0, size=(21, 3)) * spread
    points[:, 2] *= 0.1
    return points + 0.5


def frame(left: np.ndarray | None, right: np.ndarray | None) -> tuple[np.ndarray, list[bool]]:
    landmarks = np.zeros((2, 21, 3))
    present = [False, False]
    if left is not None:
        landmarks[0], present[0] = left, True
    if right is not None:
        landmarks[1], present[1] = right, True
    return landmarks, present


def write_bundle(path: Path, *, contract: str = PHRASE_FEATURE_CONTRACT, feature_count: int = PHRASE_FEATURE_COUNT, class_order_labels=None) -> None:
    features, labels = [], []
    for seed in range(30):
        for label, spread, two in [("ONE", 0.1, False), ("TWO", 0.4, True)]:
            left = hand(seed + (0 if label == "ONE" else 500), spread)
            right = hand(seed + 900, spread) if two else None
            landmarks, present = frame(left, right)
            features.append(build_phrase_features(landmarks, present))
            labels.append(label)
    model = RandomForestClassifier(n_estimators=20, random_state=0).fit(np.vstack(features), labels)
    joblib.dump(
        {
            "model": model,
            "labels": class_order_labels or list(model.classes_),
            "feature_count": feature_count,
            "feature_contract": contract,
            "verification": "unverified_dataset",
            "experimental": True,
            "citation": "test",
            "excluded_phrases": {"team": "dynamic (test)"},
            "limitations": ["synthetic"],
        },
        path,
    )


def test_one_hand_vector_fills_only_its_slot_and_flag() -> None:
    landmarks, present = frame(hand(1), None)
    vector = build_phrase_features(landmarks, present)

    assert vector.shape == (PHRASE_FEATURE_COUNT,)
    assert np.allclose(vector[63:126], 0.0)
    assert np.allclose(vector[126:129], 0.0)
    assert vector[129] == 1.0 and vector[130] == 0.0


def test_two_hand_vector_has_both_slots_and_a_wrist_offset() -> None:
    landmarks, present = frame(hand(1), hand(2))
    vector = build_phrase_features(landmarks, present)

    assert np.any(vector[0:63]) and np.any(vector[63:126])
    assert np.any(vector[126:129])
    assert vector[129] == 1.0 and vector[130] == 1.0


def test_frame_without_a_usable_hand_returns_none() -> None:
    landmarks, present = frame(None, None)
    assert build_phrase_features(landmarks, present) is None


def test_degenerate_hand_is_ignored_rather_than_guessed() -> None:
    flat = np.zeros((21, 3))
    landmarks, present = frame(flat, hand(3))
    vector = build_phrase_features(landmarks, present)

    assert vector[129] == 0.0
    assert vector[130] == 1.0


def test_recognizer_reports_a_missing_model(tmp_path: Path) -> None:
    recognizer = PhraseRecognizer(tmp_path / "missing.joblib", threshold=0.5)

    assert recognizer.available is False
    assert "No phrase model" in recognizer.error


def test_recognizer_refuses_a_bundle_with_another_feature_contract(tmp_path: Path) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path, contract="alphabet_v1_63", feature_count=63)

    recognizer = PhraseRecognizer(path, threshold=0.5)

    assert recognizer.available is False
    assert "feature contract" in recognizer.error


def test_recognizer_refuses_labels_that_do_not_match_class_order(tmp_path: Path) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path, class_order_labels=["TWO", "ONE"])

    recognizer = PhraseRecognizer(path, threshold=0.5)

    assert recognizer.available is False
    assert "class order" in recognizer.error


def test_threshold_controls_whether_a_phrase_is_returned(tmp_path: Path) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path)
    landmarks, present = frame(hand(5, 0.1), None)

    scored = PhraseRecognizer(path, threshold=0.0).predict(landmarks, present)
    above = PhraseRecognizer(path, threshold=min(1.0, scored.confidence + 0.01)).predict(landmarks, present)

    assert scored.accepted is True
    if scored.confidence < 1.0:
        assert above.accepted is False and above.label is None


def test_endpoint_lists_labels_and_excluded_phrases(tmp_path: Path, settings: Settings, camera_service) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path)
    phrase_settings = settings.model_copy(update={"phrase_model_path": path})
    with TestClient(create_app(settings=phrase_settings, camera_service=camera_service)) as client:
        body = client.get("/api/recognition/phrase/model").json()

    assert body["available"] is True
    assert body["labels"] == ["ONE", "TWO"]
    assert body["excluded_phrases"] == {"team": "dynamic (test)"}
    assert body["verification"] == "unverified_dataset"
    assert body["experimental"] is True


def test_endpoint_marks_an_excluded_phrase_as_unsupported(tmp_path: Path, settings: Settings, camera_service) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path)
    phrase_settings = settings.model_copy(update={"phrase_model_path": path})
    with TestClient(create_app(settings=phrase_settings, camera_service=camera_service)) as client:
        body = client.get("/api/recognition/phrase/latest", params={"phrase": "team"}).json()

    assert body["status"] == "unsupported"
    assert body["label"] is None
    assert "needs movement" in body["detail"]


def test_endpoint_marks_an_unknown_phrase_as_unsupported(tmp_path: Path, settings: Settings, camera_service) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path)
    phrase_settings = settings.model_copy(update={"phrase_model_path": path})
    with TestClient(create_app(settings=phrase_settings, camera_service=camera_service)) as client:
        body = client.get("/api/recognition/phrase/latest", params={"phrase": "not a phrase"}).json()

    assert body["status"] == "unsupported"


def test_endpoint_reports_camera_off_without_a_running_camera(tmp_path: Path, settings: Settings, camera_service) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path)
    phrase_settings = settings.model_copy(update={"phrase_model_path": path})
    with TestClient(create_app(settings=phrase_settings, camera_service=camera_service)) as client:
        body = client.get("/api/recognition/phrase/latest").json()

    assert body["status"] == "camera_off"
    assert body["experimental"] is True


def test_alphabet_endpoint_is_unaffected_by_the_phrase_model(tmp_path: Path, settings: Settings, camera_service) -> None:
    path = tmp_path / "phrase.joblib"
    write_bundle(path)
    phrase_settings = settings.model_copy(update={"phrase_model_path": path})
    with TestClient(create_app(settings=phrase_settings, camera_service=camera_service)) as client:
        body = client.get("/api/recognition/latest").json()

    assert body["status"] == "camera_off"


@pytest.mark.skipif(not REAL_MODEL.is_file(), reason="phrase_classifier.joblib has not been trained")
def test_real_phrase_bundle_loads_with_its_contract() -> None:
    recognizer = PhraseRecognizer(REAL_MODEL, threshold=0.7)

    assert recognizer.available, recognizer.error
    assert len(recognizer.labels) == 11
    assert "team" in recognizer.excluded_phrases
    assert recognizer.verification == "unverified_dataset"
    assert recognizer.experimental is True


@pytest.mark.skipif(not (REAL_MODEL.is_file() and REAL_LANDMARKS.is_file()), reason="phrase model or landmarks missing")
def test_real_phrase_bundle_scores_a_recorded_training_frame() -> None:
    recognizer = PhraseRecognizer(REAL_MODEL, threshold=0.0)
    data = np.load(REAL_LANDMARKS)
    present_all = ~np.isnan(data["landmarks"][:, :, 0, 0])
    index = next(i for i in range(len(data["phrase"])) if str(data["phrase"][i]) == "sick" and present_all[i].any())
    landmarks = np.nan_to_num(data["landmarks"][index].astype(np.float64))

    prediction = recognizer.predict(landmarks, present_all[index])

    assert prediction is not None
    assert prediction.label in recognizer.labels
    assert 0.0 <= prediction.confidence <= 1.0
