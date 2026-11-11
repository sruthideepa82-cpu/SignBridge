"""MediaPipe face landmark detection with blendshapes, for frames captured by OpenCV.

The Face Landmarker is created once and reused for every frame. It runs in VIDEO mode, so MediaPipe
tracks the face between frames. Callers must use it from one thread. It runs on the same frames as the
hand detector, inside the camera's processing thread, so there is only one camera session.
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from mediapipe import Image, ImageFormat
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode

from app.core.config import Settings
from app.core.exceptions import FaceDetectionUnavailableError

logger = logging.getLogger(__name__)

FaceDetectorFactory = Callable[[], "FaceDetector"]


@dataclass(frozen=True)
class DetectedFace:
    landmark_count: int
    bbox: tuple[float, float, float, float]
    points: tuple[tuple[float, float], ...]
    blendshapes: dict[str, float] | None


@dataclass(frozen=True)
class FaceDetectionResult:
    faces: tuple[DetectedFace, ...]


class FaceDetector:
    def __init__(
        self,
        model_path: Path,
        *,
        min_detection_confidence: float = 0.5,
        min_presence_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        if not model_path.is_file():
            raise FaceDetectionUnavailableError(
                f"Face model file not found at {model_path}. "
                "Run `python scripts/download_models.py` from the backend folder."
            )

        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=RunningMode.VIDEO,
            num_faces=1,
            output_face_blendshapes=True,
            min_face_detection_confidence=min_detection_confidence,
            min_face_presence_confidence=min_presence_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        try:
            self._landmarker = FaceLandmarker.create_from_options(options)
        except Exception as error:
            raise FaceDetectionUnavailableError(f"MediaPipe could not load the face model: {error}") from error

        self._last_timestamp_ms = -1

    def detect(self, frame_bgr: np.ndarray) -> FaceDetectionResult:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = Image(image_format=ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        timestamp_ms = max(int(time.monotonic() * 1000), self._last_timestamp_ms + 1)
        self._last_timestamp_ms = timestamp_ms

        result = self._landmarker.detect_for_video(image, timestamp_ms)
        faces = []
        for index, landmarks in enumerate(result.face_landmarks):
            xs = [point.x for point in landmarks]
            ys = [point.y for point in landmarks]
            blendshapes = None
            if result.face_blendshapes and index < len(result.face_blendshapes):
                blendshapes = {item.category_name: float(item.score) for item in result.face_blendshapes[index]}
            faces.append(
                DetectedFace(
                    landmark_count=len(landmarks),
                    bbox=(min(xs), min(ys), max(xs), max(ys)),
                    points=tuple((float(point.x), float(point.y)) for point in landmarks),
                    blendshapes=blendshapes,
                )
            )
        return FaceDetectionResult(faces=tuple(faces))

    def close(self) -> None:
        self._landmarker.close()


def create_face_detector_factory(settings: Settings) -> FaceDetectorFactory | None:
    if not settings.face_detection_enabled:
        return None

    def build() -> FaceDetector:
        return FaceDetector(
            settings.face_model_path,
            min_detection_confidence=settings.face_min_detection_confidence,
            min_presence_confidence=settings.face_min_presence_confidence,
            min_tracking_confidence=settings.face_min_tracking_confidence,
        )

    return build
