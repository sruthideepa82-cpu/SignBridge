from typing import Literal

from pydantic import BaseModel


class RecognitionResponse(BaseModel):
    status: Literal["camera_off", "no_model", "no_hand", "two_hands", "uncertain", "recognized"]
    label: str | None = None
    confidence: float | None = None
    threshold: float
    frame_sequence: int
    detail: str | None = None
