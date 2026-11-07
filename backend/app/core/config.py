from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration. Values are read from environment variables prefixed
    with SIGNBRIDGE_ (for example SIGNBRIDGE_CAMERA_INDEX=1), or from backend/.env."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_prefix="SIGNBRIDGE_",
        extra="ignore",
    )

    app_name: str = "SignBridge API"
    app_version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    camera_index: int = 0
    camera_width: int = 640
    camera_height: int = 480
    camera_fps: int = 30
    camera_jpeg_quality: int = 80
    camera_max_read_failures: int = 30

    hand_detection_enabled: bool = True
    hand_model_path: Path = BACKEND_DIR / "models" / "hand_landmarker.task"
    hand_max_hands: int = 2
    hand_min_detection_confidence: float = 0.5
    hand_min_presence_confidence: float = 0.5
    hand_min_tracking_confidence: float = 0.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
