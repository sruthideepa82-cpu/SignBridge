from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class LandmarkPointResponse(BaseModel):
    index: int
    name: str
    x: float
    y: float
    z: float


class HandResponse(BaseModel):
    handedness: str
    score: float
    landmarks: list[LandmarkPointResponse]


class HandLandmarksResponse(BaseModel):
    status: Literal["camera_off", "detection_unavailable", "no_hand", "hand_detected"]
    running: bool
    detection_available: bool
    detection_error: str | None = None
    frame_sequence: int
    hand_count: int
    hands: list[HandResponse]
    timestamp: datetime
