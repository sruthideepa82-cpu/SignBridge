"""Temporal sign recognition from a sliding window of hand landmarks.

The model is produced by signbridge_training/02_train.py. Its feature function is loaded from
signbridge_training/features.py, so training and serving use the same features. Without a model file, with
a model card that marks the model as synthetic, or with a model that does not match its card, the recognizer
reports why and never guesses.
"""

import importlib.util
import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

import numpy as np

from app.services.hand_detection_service import DetectedHand

logger = logging.getLogger(__name__)

SYNTHETIC_FLAG = "synthetic"
UNKNOWN_SPLIT_CAVEAT = "model_card.json has no split record, so the model is not known to be tested on unseen signers."
NOT_SIGNER_TESTED_CAVEAT = "Not tested on unseen signers."
# Same rule as signbridge_training/01_extract_landmarks.py: a clip needs hands in at least 30% of its frames.
MIN_HAND_FRAME_SHARE = 0.3
HANDS = 2
LANDMARKS = 21
COORDS = 3


def load_feature_module(code_dir: Path) -> ModuleType:
    """Loads features.py by file path. The backend's own `app` package is not touched."""
    path = code_dir / "features.py"
    if not path.is_file():
        raise FileNotFoundError(f"features.py was not found in {code_dir}")
    spec = importlib.util.spec_from_file_location("signbridge_features", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_window(hand_frames: Sequence[Sequence[DetectedHand]]) -> tuple[np.ndarray, int]:
    """Lays out frames as (T, 2, 21, 3) with slot 0 = Left and slot 1 = Right, zeros for a missing hand.

    This matches the layout in 01_extract_landmarks.py exactly. Returns the window and how many frames
    had at least one hand.
    """
    window = np.zeros((len(hand_frames), HANDS, LANDMARKS, COORDS), np.float32)
    frames_with_hands = 0
    for t, hands in enumerate(hand_frames):
        if hands:
            frames_with_hands += 1
        for hand in hands:
            slot = 0 if hand.handedness == "Left" else 1
            window[t, slot] = [[point.x, point.y, point.z] for point in hand.landmarks]
    return window, frames_with_hands


@dataclass(frozen=True)
class SequenceTop:
    word: str
    confidence: float


@dataclass(frozen=True)
class SequencePrediction:
    status: str  # "recognized" | "uncertain"
    word: str | None
    confidence: float
    top3: tuple[SequenceTop, ...]


class SequenceRecognizer:
    def __init__(
        self,
        model_dir: Path,
        threshold: float,
        code_dir: Path,
        allow_synthetic: bool = False,
    ) -> None:
        self._threshold = threshold
        self._model: object | None = None
        self._classes: list[str] = []
        self._caveat: str | None = None
        self._error: str | None = None
        self._features = None
        self._window_frames = 0
        try:
            module = load_feature_module(code_dir)
            self._features = module.features
            self._window_frames = int(module.WINDOW_FRAMES)
        except Exception as error:
            self._error = f"The sign feature code could not be loaded: {error}"
            return
        self._load(model_dir, allow_synthetic)

    def _load(self, directory: Path, allow_synthetic: bool) -> None:
        model_path = directory / "model.joblib"
        card_path = directory / "model_card.json"
        if not model_path.is_file() or not card_path.is_file():
            self._error = (
                f"No trained sign model found in {directory}. Train one with signbridge_training/02_train.py."
            )
            return
        try:
            card = json.loads(card_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            self._error = f"model_card.json could not be read: {error}"
            return
        if card.get(SYNTHETIC_FLAG) and not allow_synthetic:
            self._error = "The model file is a synthetic test model and will not be served."
            return
        classes = [str(label) for label in card.get("classes", [])]
        if not classes:
            self._error = "model_card.json lists no classes."
            return
        if int(card.get("frames", -1)) != self._window_frames:
            self._error = (
                f"The model expects {card.get('frames')} frames; the server uses {self._window_frames}."
            )
            return
        try:
            import joblib

            model = joblib.load(model_path)
        except Exception as error:
            logger.exception("Could not load the sign model")
            self._error = f"The model file could not be loaded: {error}"
            return
        try:
            indices = np.asarray(model.classes_, dtype=int)
        except (AttributeError, TypeError, ValueError):
            self._error = "The model does not expose integer class indices."
            return
        if indices.size == 0 or indices.min() < 0 or indices.max() >= len(classes):
            self._error = "The model's class indices do not match model_card.json."
            return

        if "signer_independent" in card:
            signer_independent = bool(card["signer_independent"])
            caveat = card.get("caveat")
        else:
            signer_independent, caveat = False, UNKNOWN_SPLIT_CAVEAT
        if not signer_independent and not caveat:
            caveat = NOT_SIGNER_TESTED_CAVEAT

        self._model = model
        self._classes = classes
        self._caveat = caveat

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
    def caveat(self) -> str | None:
        return self._caveat

    @property
    def window_frames(self) -> int:
        return self._window_frames

    def predict(self, window: np.ndarray) -> SequencePrediction:
        if self._model is None or self._features is None:
            raise RuntimeError(self._error or "No sign model is loaded.")
        expected = (self._window_frames, HANDS, LANDMARKS, COORDS)
        if window.shape != expected:
            raise ValueError(f"Expected a window of shape {expected}, got {window.shape}.")

        proba = self._model.predict_proba(self._features(window.astype(np.float32)[None, ...]))[0]
        full = np.zeros(len(self._classes))
        full[np.asarray(self._model.classes_, dtype=int)] = proba
        order = np.argsort(-full)
        top3 = tuple(SequenceTop(word=self._classes[i], confidence=float(full[i])) for i in order[:3])
        best = top3[0]
        if best.confidence >= self._threshold:
            return SequencePrediction(status="recognized", word=best.word, confidence=best.confidence, top3=top3)
        return SequencePrediction(status="uncertain", word=None, confidence=best.confidence, top3=top3)
