"""MediaPipe hand landmark detection for frames captured by OpenCV.

The landmarker is created once and reused for every frame. It runs in VIDEO mode,
so MediaPipe can track hands between frames. Callers must use it from one thread.
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
from mediapipe.tasks.python.components.containers.landmark import NormalizedLandmark
from mediapipe.tasks.python.vision import (
    HandLandmarker,
    HandLandmarkerOptions,
    RunningMode,
    drawing_utils,
)
from mediapipe.tasks.python.vision.hand_landmarker import HandLandmark, HandLandmarksConnections

from app.core.config import Settings
from app.core.exceptions import HandDetectionUnavailableError

logger = logging.getLogger(__name__)

LANDMARK_STYLE = drawing_utils.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=3)
CONNECTION_STYLE = drawing_utils.DrawingSpec(color=(255, 255, 255), thickness=2)

HandDetectorFactory = Callable[[], "HandDetector"]


@dataclass(frozen=True)
class LandmarkPoint:
    index: int
    name: str
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class DetectedHand:
    handedness: str
    score: float
    landmarks: tuple[LandmarkPoint, ...]


@dataclass(frozen=True)
class HandDetectionResult:
    hands: tuple[DetectedHand, ...]


class HandDetector:
    def __init__(
        self,
        model_path: Path,
        *,
        max_hands: int = 2,
        min_detection_confidence: float = 0.5,
        min_presence_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        if not model_path.is_file():
            raise HandDetectionUnavailableError(
                f"Hand model file not found at {model_path}. "
                "Run `python scripts/download_models.py` from the backend folder."
            )

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=RunningMode.VIDEO,
            num_hands=max_hands,
            min_hand_detection_confidence=min_detection_confidence,
            min_hand_presence_confidence=min_presence_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        try:
            self._landmarker = HandLandmarker.create_from_options(options)
        except Exception as error:
            raise HandDetectionUnavailableError(
                f"MediaPipe could not load the hand model: {error}"
            ) from error

        self._last_timestamp_ms = -1

    def detect(self, frame_bgr: np.ndarray) -> HandDetectionResult:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = Image(image_format=ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        timestamp_ms = max(int(time.monotonic() * 1000), self._last_timestamp_ms + 1)
        self._last_timestamp_ms = timestamp_ms

        result = self._landmarker.detect_for_video(image, timestamp_ms)
        return _to_result(result)

    def annotate(self, frame_bgr: np.ndarray, result: HandDetectionResult) -> np.ndarray:
        annotated = frame_bgr.copy()
        for hand in result.hands:
            landmarks = [NormalizedLandmark(x=p.x, y=p.y, z=p.z) for p in hand.landmarks]
            drawing_utils.draw_landmarks(
                annotated,
                landmarks,
                HandLandmarksConnections.HAND_CONNECTIONS,
                LANDMARK_STYLE,
                CONNECTION_STYLE,
            )
        return annotated

    def close(self) -> None:
        self._landmarker.close()


def _to_result(raw_result) -> HandDetectionResult:
    hands = []
    for hand_index, landmarks in enumerate(raw_result.hand_landmarks):
        category = raw_result.handedness[hand_index][0]
        points = tuple(
            LandmarkPoint(
                index=index,
                name=HandLandmark(index).name,
                x=float(point.x),
                y=float(point.y),
                z=float(point.z),
            )
            for index, point in enumerate(landmarks)
        )
        hands.append(
            DetectedHand(
                handedness=category.category_name,
                score=float(category.score),
                landmarks=points,
            )
        )
    return HandDetectionResult(hands=tuple(hands))


def create_hand_detector_factory(settings: Settings) -> HandDetectorFactory | None:
    if not settings.hand_detection_enabled:
        return None

    def build() -> HandDetector:
        return HandDetector(
            settings.hand_model_path,
            max_hands=settings.hand_max_hands,
            min_detection_confidence=settings.hand_min_detection_confidence,
            min_presence_confidence=settings.hand_min_presence_confidence,
            min_tracking_confidence=settings.hand_min_tracking_confidence,
        )

    return build
