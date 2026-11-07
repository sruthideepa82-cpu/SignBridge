from pydantic import BaseModel


class CameraStatusResponse(BaseModel):
    running: bool
    camera_index: int
    width: int
    height: int
    fps: int
    last_error: str | None = None
