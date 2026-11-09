import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

import features as shared_features
from app import model_service
from app.main import app, get_model_service
from app.model_service import ModelService, load_model


def payload(window: np.ndarray) -> dict:
    return {"landmarks": window.tolist()}


@pytest.fixture
def synthetic_service(synthetic_model_dir) -> ModelService:
    # Test-only: allow_synthetic lets the synthetic test model load.
    return ModelService.from_disk(synthetic_model_dir, threshold=0.6, allow_synthetic=True)


@pytest.fixture
def http(synthetic_service):
    app.dependency_overrides[get_model_service] = lambda: synthetic_service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_training_and_serving_use_the_same_feature_function():
    assert model_service.features is shared_features.features


def test_no_model_file_reports_no_model(tmp_path):
    service = ModelService.from_disk(tmp_path, threshold=0.6)

    assert not service.available
    result = service.predict(np.zeros((32, 2, 21, 3), np.float32))
    assert result.status == "no_model"
    assert result.word is None
    assert result.top3 == []


def test_predict_endpoint_reports_no_model_when_no_model_is_trained(tmp_path, monkeypatch, window):
    monkeypatch.setenv("ML_MODEL_DIR", str(tmp_path))
    with TestClient(app) as client:
        response = client.post("/api/predict", json=payload(window))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "no_model"
    assert body["word"] is None
    assert "No trained model" in body["detail"]


def test_synthetic_model_is_refused_outside_tests(synthetic_model_dir):
    loaded, error = load_model(synthetic_model_dir)

    assert loaded is None
    assert "synthetic" in error


def test_synthetic_model_loads_only_when_explicitly_allowed(synthetic_model_dir):
    loaded, error = load_model(synthetic_model_dir, allow_synthetic=True)

    assert error is None
    assert loaded is not None
    assert loaded.frames == 32


def test_predict_returns_word_confidence_and_top3(http, window):
    response = http.post("/api/predict", json=payload(window))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"recognized", "uncertain"}
    assert 0.0 <= body["confidence"] <= 1.0
    assert body["threshold"] == 0.6

    top3 = body["top3"]
    assert len(top3) == 3
    confidences = [item["confidence"] for item in top3]
    assert confidences == sorted(confidences, reverse=True)
    assert top3[0]["word"].startswith("sign_")
    assert body["confidence"] == top3[0]["confidence"]
    if body["status"] == "recognized":
        assert body["word"] == top3[0]["word"]
    else:
        assert body["word"] is None


def test_top3_matches_the_model_probabilities(synthetic_service, window):
    loaded = synthetic_service._loaded
    probabilities = loaded.model.predict_proba(shared_features.features(window[None]))[0]
    expected_index = int(np.asarray(loaded.model.classes_, dtype=int)[np.argmax(probabilities)])

    assert synthetic_service.predict(window).top3[0].word == loaded.classes[expected_index]


@pytest.mark.parametrize(
    "landmarks",
    [
        np.zeros((31, 2, 21, 3)).tolist(),
        np.zeros((32, 1, 21, 3)).tolist(),
        np.zeros((32, 2, 20, 3)).tolist(),
        np.zeros((32, 2, 21, 2)).tolist(),
    ],
)
def test_predict_rejects_wrong_shapes(http, landmarks):
    assert http.post("/api/predict", json={"landmarks": landmarks}).status_code == 422


def test_predict_rejects_non_finite_coordinates(http):
    # Build a valid body, then put a non-JSON Infinity token in the first coordinate.
    body = json.dumps({"landmarks": np.zeros((32, 2, 21, 3)).tolist()})
    body = body.replace("0.0", "Infinity", 1)
    response = http.post("/api/predict", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422
