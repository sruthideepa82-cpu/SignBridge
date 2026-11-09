"""Runs the sign model trained in signbridge_training/ on a 32-frame, two-hand landmark window.

Training and serving share one feature function: features() is imported from the training folder,
not copied. The model file is loaded once at startup. Without a real model, predict() reports
no_model and never guesses.
"""

import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np

from app.config import confidence_threshold, ml_code_dir, model_dir

logger = logging.getLogger(__name__)

_code_dir = str(ml_code_dir())
if _code_dir not in sys.path:
    sys.path.insert(0, _code_dir)

from features import WINDOW_FRAMES, features  # noqa: E402  (shared with 02_train.py)

WINDOW_SHAPE = (WINDOW_FRAMES, 2, 21, 3)
SYNTHETIC_FLAG = "synthetic"


UNKNOWN_SPLIT_CAVEAT = "model_card.json has no split record, so the model is not known to be tested on unseen signers."


@dataclass(frozen=True)
class LoadedModel:
    model: object
    classes: list[str]
    frames: int
    signer_independent: bool
    caveat: str | None


@dataclass(frozen=True)
class TopItem:
    word: str
    confidence: float


@dataclass(frozen=True)
class PredictionResult:
    status: str  # "recognized" | "uncertain" | "no_model"
    word: str | None
    confidence: float
    top3: list[TopItem] = field(default_factory=list)
    detail: str | None = None
    caveat: str | None = None


def load_model(directory: Path, allow_synthetic: bool = False) -> tuple[LoadedModel | None, str | None]:
    """Returns (model, None) or (None, reason). Never raises for a missing or bad model file."""
    model_path = directory / "model.joblib"
    card_path = directory / "model_card.json"
    if not model_path.is_file() or not card_path.is_file():
        return None, f"No trained model found in {directory}. Train one with signbridge_training/02_train.py."

    try:
        card = json.loads(card_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return None, f"model_card.json could not be read: {error}"

    if card.get(SYNTHETIC_FLAG) and not allow_synthetic:
        return None, "The model file is a synthetic test model and will not be served."

    classes = [str(label) for label in card.get("classes", [])]
    if not classes:
        return None, "model_card.json lists no classes."
    if int(card.get("frames", -1)) != WINDOW_FRAMES:
        return None, f"The model expects {card.get('frames')} frames; the server sends {WINDOW_FRAMES}."

    try:
        model = joblib.load(model_path)
    except Exception as error:  # corrupt file or incompatible library versions
        logger.exception("Could not load the sign model")
        return None, f"The model file could not be loaded: {error}"

    # 02_train.py fits on class indices, so model.classes_ are indices into the card's class list.
    try:
        indices = np.asarray(model.classes_, dtype=int)
    except (AttributeError, TypeError, ValueError):
        return None, "The model does not expose integer class indices."
    if indices.size == 0 or indices.min() < 0 or indices.max() >= len(classes):
        return None, "The model's class indices do not match model_card.json."

    if "signer_independent" in card:
        signer_independent = bool(card["signer_independent"])
        caveat = card.get("caveat")
    else:
        signer_independent, caveat = False, UNKNOWN_SPLIT_CAVEAT
    if not signer_independent and not caveat:
        caveat = "Not tested on unseen signers."

    return LoadedModel(model=model, classes=classes, frames=WINDOW_FRAMES,
                       signer_independent=signer_independent, caveat=caveat), None


class ModelService:
    def __init__(self, loaded: LoadedModel | None, error: str | None, threshold: float) -> None:
        self._loaded = loaded
        self._error = error
        self._threshold = threshold

    @classmethod
    def from_disk(
        cls,
        directory: Path | None = None,
        threshold: float | None = None,
        allow_synthetic: bool = False,
    ) -> "ModelService":
        # allow_synthetic is for tests only. The server never passes it.
        loaded, error = load_model(directory or model_dir(), allow_synthetic=allow_synthetic)
        return cls(loaded, error, threshold if threshold is not None else confidence_threshold())

    @property
    def available(self) -> bool:
        return self._loaded is not None

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def threshold(self) -> float:
        return self._threshold

    @property
    def caveat(self) -> str | None:
        return self._loaded.caveat if self._loaded else None

    def predict(self, window: np.ndarray) -> PredictionResult:
        if self._loaded is None:
            return PredictionResult(status="no_model", word=None, confidence=0.0, detail=self._error)

        if window.shape != WINDOW_SHAPE:
            raise ValueError(f"Expected a window of shape {WINDOW_SHAPE}, got {window.shape}.")

        batch = window.astype(np.float32)[None, ...]
        proba = self._loaded.model.predict_proba(features(batch))[0]

        full = np.zeros(len(self._loaded.classes))
        full[np.asarray(self._loaded.model.classes_, dtype=int)] = proba

        order = np.argsort(-full)
        top3 = [TopItem(word=self._loaded.classes[i], confidence=float(full[i])) for i in order[:3]]
        best = top3[0]
        status = "recognized" if best.confidence >= self._threshold else "uncertain"
        return PredictionResult(
            status=status,
            word=best.word if status == "recognized" else None,
            confidence=best.confidence,
            top3=top3,
            caveat=self._loaded.caveat,
        )
