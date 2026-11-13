"""Daily-phrase recognition from one frame of hand landmarks, using a separate scikit-learn model.

The model file is produced by ai-engine/training/phrase_recognition/train_phrase_classifier.py. It is independent
of the 16-letter alphabet model: different file, different feature contract (131 values), different labels.
Without a valid bundle the recognizer reports why and never guesses.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.services.phrase_features import PHRASE_FEATURE_CONTRACT, PHRASE_FEATURE_COUNT, build_phrase_features

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PhrasePrediction:
    label: str | None
    confidence: float
    accepted: bool


class PhraseRecognizer:
    def __init__(self, model_path: Path, threshold: float) -> None:
        self._threshold = threshold
        self._model = None
        self._labels: list[str] = []
        self._excluded: dict[str, str] = {}
        self._error: str | None = None
        self._verification: str | None = None
        self._experimental: bool | None = None
        self._citation: str | None = None
        self._limitations: list[str] = []
        if not model_path.is_file():
            self._error = "No phrase model found. Train it with ai-engine/training/phrase_recognition."
            return
        try:
            import joblib

            bundle = joblib.load(model_path)
            model = bundle["model"]
            labels = [str(label) for label in bundle["labels"]]
            feature_count = bundle.get("feature_count")
            contract = bundle.get("feature_contract")
        except Exception as error:
            logger.exception("Could not load the phrase model")
            self._error = f"The phrase model could not be loaded: {error}"
            return
        if feature_count != PHRASE_FEATURE_COUNT or contract != PHRASE_FEATURE_CONTRACT:
            self._error = (
                f"The phrase model uses feature contract {contract!r} with {feature_count} features; "
                f"the server expects {PHRASE_FEATURE_CONTRACT!r} with {PHRASE_FEATURE_COUNT}."
            )
            return
        # predict() indexes labels by position in predict_proba, which follows the model's own class order.
        if [str(label) for label in getattr(model, "classes_", [])] != labels:
            self._error = "The phrase model's labels do not match its class order. Retrain the model."
            return
        self._model = model
        self._labels = labels
        self._excluded = {str(k): str(v) for k, v in dict(bundle.get("excluded_phrases", {})).items()}
        self._verification = str(bundle.get("verification", "unverified"))
        self._experimental = bool(bundle.get("experimental", True))
        self._citation = bundle.get("citation")
        self._limitations = [str(item) for item in bundle.get("limitations", [])]

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
    def labels(self) -> list[str]:
        return list(self._labels)

    @property
    def excluded_phrases(self) -> dict[str, str]:
        return dict(self._excluded)

    @property
    def verification(self) -> str | None:
        return self._verification if self.available else None

    @property
    def experimental(self) -> bool | None:
        return self._experimental if self.available else None

    @property
    def citation(self) -> str | None:
        return self._citation if self.available else None

    @property
    def limitations(self) -> list[str]:
        return list(self._limitations) if self.available else []

    def predict(self, landmarks, present) -> PhrasePrediction | None:
        """Returns None when no hand in the frame is usable. Otherwise a prediction, accepted or not."""
        if self._model is None:
            raise RuntimeError(self._error or "No phrase model loaded.")
        vector = build_phrase_features(landmarks, present)
        if vector is None:
            return None
        probabilities = self._model.predict_proba(vector.reshape(1, -1))[0]
        best = int(np.argmax(probabilities))
        confidence = float(probabilities[best])
        if confidence < self._threshold:
            return PhrasePrediction(label=None, confidence=confidence, accepted=False)
        return PhrasePrediction(label=self._labels[best], confidence=confidence, accepted=True)
