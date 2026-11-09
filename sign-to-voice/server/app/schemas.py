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
