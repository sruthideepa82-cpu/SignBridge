from typing import Literal

from pydantic import BaseModel, Field


class FaceExpressionScores(BaseModel):
    Happy: float
    Sad: float
    Angry: float
    Surprised: float
    Neutral: float


class FaceResponse(BaseModel):
    bbox: list[float] = Field(description="[xmin, ymin, xmax, ymax], normalised to the frame (0 to 1).")
    partially_outside_frame: bool
    landmarks: list[list[float]] = Field(description="478 [x, y] points, normalised to the frame, in MediaPipe order.")
    blendshapes: dict[str, float] | None = Field(
        default=None,
        description="Scores (0 to 1) for each of MediaPipe's 52 facial blendshape categories, from the model output.",
    )


class FaceExpressionResponse(BaseModel):
    status: Literal["camera_off", "detection_unavailable", "processing_error", "no_face", "face_detected"]
    running: bool
    detection_available: bool
    detection_error: str | None = None
    frame_sequence: int
    face_count: int
    landmark_count: int
    faces: list[FaceResponse] = []
    expression: Literal["Happy", "Sad", "Angry", "Surprised", "Neutral"] | None = None
    strength: float | None = Field(default=None, description="Heuristic 0-1 strength of the expression. Not a probability.")
    scores: FaceExpressionScores | None = None
    frames_smoothed: int = 0
    estimate_note: str = "Estimated from facial movements. Not a verified reading of the person's feelings."
