import math
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Must match the emotion labels in client/src/recognition/emotion.ts.
EMOTIONS = ("Happy", "Sad", "Neutral", "Angry", "Questioning", "Skeptical")
Emotion = Literal["Happy", "Sad", "Neutral", "Angry", "Questioning", "Skeptical"]

GLOSS_PATTERN = re.compile(r"^[A-Z][A-Z_]{0,19}$")
MAX_GLOSSES = 40


class InterpretRequest(BaseModel):
    glosses: list[str] = Field(min_length=1, max_length=MAX_GLOSSES)
    emotion: Emotion

    @field_validator("glosses")
    @classmethod
    def check_glosses(cls, glosses: list[str]) -> list[str]:
        for gloss in glosses:
            if not GLOSS_PATTERN.match(gloss):
                raise ValueError(f"invalid gloss: {gloss!r}")
        return glosses


class InterpretResponse(BaseModel):
    sentence: str


PREDICT_FRAMES = 32
PREDICT_HANDS = 2
PREDICT_LANDMARKS = 21
PREDICT_COORDS = 3


class PredictRequest(BaseModel):
    """A window of 32 frames, each with 2 hand slots (Left, Right), 21 landmarks, and x, y, z."""

    landmarks: list[list[list[list[float]]]]

    @field_validator("landmarks")
    @classmethod
    def check_shape(cls, landmarks: list) -> list:
        if len(landmarks) != PREDICT_FRAMES:
            raise ValueError(f"expected {PREDICT_FRAMES} frames, got {len(landmarks)}")
        for frame in landmarks:
            if len(frame) != PREDICT_HANDS:
                raise ValueError(f"expected {PREDICT_HANDS} hand slots per frame, got {len(frame)}")
            for hand in frame:
                if len(hand) != PREDICT_LANDMARKS:
                    raise ValueError(f"expected {PREDICT_LANDMARKS} landmarks per hand, got {len(hand)}")
                for point in hand:
                    if len(point) != PREDICT_COORDS or not all(math.isfinite(v) for v in point):
                        raise ValueError("every landmark needs three finite coordinates")
        return landmarks


class TopItemModel(BaseModel):
    word: str
    confidence: float


class PredictResponse(BaseModel):
    status: Literal["recognized", "uncertain", "no_model"]
    word: str | None
    confidence: float
    top3: list[TopItemModel]
    threshold: float
    detail: str | None = None
    caveat: str | None = None
