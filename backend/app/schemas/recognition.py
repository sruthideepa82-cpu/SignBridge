from typing import Literal

from pydantic import BaseModel


class RecognitionResponse(BaseModel):
    status: Literal["camera_off", "no_model", "no_hand", "two_hands", "uncertain", "recognized"]
    label: str | None = None
    confidence: float | None = None
    threshold: float
    frame_sequence: int
    detail: str | None = None
    # True when the active model is not verified (for example trained on public data). Clients must show it.
    experimental: bool | None = None
    verification: str | None = None

SequenceStatus = Literal[
    "camera_off",
    "detection_unavailable",
    "no_model",
    "warming_up",
    "no_hand",
    "uncertain",
    "recognized",
]


class SequenceTopItem(BaseModel):
    word: str
    confidence: float


class SequenceResponse(BaseModel):
    status: SequenceStatus
    word: str | None = None
    confidence: float | None = None
    top3: list[SequenceTopItem] = []
    threshold: float
    frame_sequence: int
    window_frames: int
    collected_frames: int = 0
    hand_frames: int = 0
    caveat: str | None = None
    detail: str | None = None
