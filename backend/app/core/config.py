from functools import lru_cache
from pathlib import Path

from pydantic import Field
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

    camera_index: int = Field(default=0, ge=0)
    camera_width: int = Field(default=640, ge=1, le=7680)
    camera_height: int = Field(default=480, ge=1, le=4320)
    camera_fps: int = Field(default=30, ge=1, le=120)
    camera_jpeg_quality: int = Field(default=80, ge=1, le=100)
    camera_max_read_failures: int = Field(default=30, ge=1)
    # Development and testing only: read this video file (looping) instead of a webcam.
    camera_video_file: Path | None = None

    hand_detection_enabled: bool = True
    hand_model_path: Path = BACKEND_DIR / "models" / "hand_landmarker.task"
    hand_max_hands: int = Field(default=2, ge=1, le=2)
    hand_min_detection_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    hand_min_presence_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    hand_min_tracking_confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    face_detection_enabled: bool = True
    face_model_path: Path = BACKEND_DIR / "models" / "face_landmarker.task"
    face_min_detection_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    face_min_presence_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    face_min_tracking_confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    recognition_model_path: Path = BACKEND_DIR.parent / "ai-engine" / "models" / "static_classifier.joblib"
    recognition_threshold: float = Field(default=0.7, ge=0.0, le=1.0)

    # Temporal sign model trained by signbridge_training/02_train.py. The folder also holds features.py,
    # which the backend imports so training and serving share one feature function.
    sequence_code_dir: Path = BACKEND_DIR.parent / "signbridge_training"
    sequence_model_dir: Path = BACKEND_DIR.parent / "signbridge_training" / "model"
    sequence_threshold: float = Field(default=0.6, ge=0.0, le=1.0)

    # Developer-only dataset collection. Off unless explicitly enabled; the routes return 404 otherwise.
    developer_tools_enabled: bool = False
    ai_engine_dir: Path = BACKEND_DIR.parent / "ai-engine"
    dataset_dir: Path = BACKEND_DIR.parent / "ai-engine" / "dataset"
    dataset_vocabulary_path: Path = BACKEND_DIR.parent / "ai-engine" / "dataset" / "metadata" / "vocabulary.json"
    dataset_min_frames: int = Field(default=10, ge=1)
    dataset_max_frames: int = Field(default=600, ge=10)


@lru_cache
def get_settings() -> Settings:
    return Settings()
