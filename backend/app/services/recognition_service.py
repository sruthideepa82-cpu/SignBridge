"""Static handshape recognition from one hand's landmarks, using a trained scikit-learn model.

The model file is produced by ai-engine/training/train_static_classifier.py. Without a model file the
service reports "no model" and never guesses. A label is returned only when its probability clears the
configured threshold.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.services.landmark_features import normalize_hand

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Prediction:
    label: str | None
    confidence: float
    accepted: bool


FEATURE_COUNT = 63


class StaticRecognizer:
    def __init__(self, model_path: Path, threshold: float) -> None:
        self._threshold = threshold
        self._model = None
        self._labels: list[str] = []
        self._error: str | None = None
        self._verification: str | None = None
        self._experimental: bool | None = None
        if not model_path.is_file():
            self._error = (
                "No trained model found. Record samples and run ai-engine/training/train_static_classifier.py."
            )
            return
        try:
            import joblib

            bundle = joblib.load(model_path)
            model = bundle["model"]
            labels = [str(label) for label in bundle["labels"]]
            feature_count = bundle.get("feature_count")
        except Exception as error:
            logger.exception("Could not load the recognition model")
            self._error = f"The recognition model could not be loaded: {error}"
            return
        if feature_count != FEATURE_COUNT:
            self._error = f"The model expects {feature_count} features; the server uses {FEATURE_COUNT}."
            return
        # predict() indexes labels by the position of the highest probability. That is only correct when the
        # labels are in the model's own class order.
        if [str(label) for label in getattr(model, "classes_", [])] != labels:
            self._error = "The model's labels do not match its class order. Retrain the model."
            return
        self._model = model
        self._labels = labels
        # Bundles without these keys are treated as experimental, so an unknown model is never shown as verified.
        self._verification = str(bundle.get("verification", "unverified"))
        self._experimental = bool(bundle.get("experimental", True))

    @property
    def available(self) -> bool:
        return self._model is not None

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def threshold(self) -> float:
        return self._threshold

    @property
    def verification(self) -> str | None:
        return self._verification if self.available else None

    @property
    def experimental(self) -> bool | None:
        return self._experimental if self.available else None

    def predict(self, landmarks) -> Prediction:
        if self._model is None:
            raise RuntimeError(self._error or "No model loaded.")
        features = normalize_hand(landmarks).reshape(1, -1)
        probabilities = self._model.predict_proba(features)[0]
        best = int(np.argmax(probabilities))
        confidence = float(probabilities[best])
        if confidence < self._threshold:
            return Prediction(label=None, confidence=confidence, accepted=False)
        return Prediction(label=self._labels[best], confidence=confidence, accepted=True)
