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


class StaticRecognizer:
    def __init__(self, model_path: Path, threshold: float) -> None:
        self._threshold = threshold
        self._model = None
        self._labels: list[str] = []
        self._error: str | None = None
        if not model_path.is_file():
            self._error = (
                "No trained model found. Record samples and run ai-engine/training/train_static_classifier.py."
            )
            return
        try:
            import joblib

            bundle = joblib.load(model_path)
            self._model = bundle["model"]
            self._labels = [str(label) for label in bundle["labels"]]
        except Exception as error:
            logger.exception("Could not load the recognition model")
            self._error = f"The recognition model could not be loaded: {error}"

    @property
    def available(self) -> bool:
        return self._model is not None

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def threshold(self) -> float:
        return self._threshold

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
