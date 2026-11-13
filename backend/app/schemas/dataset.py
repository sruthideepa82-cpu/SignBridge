from typing import Literal

from pydantic import BaseModel, Field


class HandRequest(BaseModel):
    handedness: Literal["Left", "Right"]
    score: float = Field(ge=0.0, le=1.0)
    landmarks: list[tuple[float, float, float]] = Field(min_length=21, max_length=21)


class FrameRequest(BaseModel):
    t_ms: int = Field(ge=0)
    hands: list[HandRequest] = Field(max_length=2)


class ClipRequest(BaseModel):
    label: str = Field(min_length=1, max_length=8)
    participant: str = Field(min_length=1, max_length=16)
    consent_ref: str = Field(min_length=1, max_length=64)
    session: str = Field(min_length=1, max_length=40)
    frames: list[FrameRequest] = Field(min_length=1, max_length=600)


class ClipSummary(BaseModel):
    clip_id: str
    label: str
    participant: str
    session: str
    consent_ref: str
    recorded_at: str
    frame_count: int
    frames_with_hands: int
