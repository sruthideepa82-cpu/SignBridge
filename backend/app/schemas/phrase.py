from typing import Literal

from pydantic import BaseModel

PhraseStatus = Literal["camera_off", "no_model", "no_hand", "uncertain", "recognized", "unsupported"]


class PhraseRecognitionResponse(BaseModel):
    status: PhraseStatus
    label: str | None = None
    confidence: float | None = None
    threshold: float
    frame_sequence: int
    detail: str | None = None
    # Always true for the phrase model. Clients must show "Experimental – Unverified Dataset".
    experimental: bool | None = None
    verification: str | None = None


class PhraseModelResponse(BaseModel):
    available: bool
    error: str | None = None
    labels: list[str] = []
    excluded_phrases: dict[str, str] = {}
    threshold: float
    experimental: bool | None = None
    verification: str | None = None
    citation: str | None = None
    limitations: list[str] = []
