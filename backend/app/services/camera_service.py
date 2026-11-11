"""OpenCV webcam capture with optional MediaPipe hand and face detection.

Two background threads run while the camera is on:

- The capture thread owns the camera handle and reads frames at the camera rate.
- The processing thread takes the newest raw frame, runs hand detection and face detection (if
  enabled), draws the annotations, and publishes a JPEG for the stream.

Hand and face detection run on the same frame in the same thread, so one camera session serves both.
If processing is slower than capture, the processing thread skips to the newest frame instead of
building a backlog. Any number of viewers share one capture device.
"""

import logging
import sys
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from app.core.config import Settings
from app.core.exceptions import CameraUnavailableError, HandDetectionUnavailableError
from app.services.face_detection_service import DetectedFace, FaceDetector, FaceDetectorFactory
from app.services.face_expression_service import ExpressionSmoother, SmoothedExpression, classify_expression
from app.services.hand_detection_service import DetectedHand, HandDetector, HandDetectorFactory

logger = logging.getLogger(__name__)

MJPEG_BOUNDARY = "frame"
STREAM_WAIT_SECONDS = 1.0
STOP_JOIN_TIMEOUT_SECONDS = 5.0
READ_RETRY_DELAY_SECONDS = 0.05
DETECTION_DISABLED_MESSAGE = "Hand detection is disabled in the backend settings."
FACE_DETECTION_DISABLED_MESSAGE = "Face detection is disabled in the backend settings."

CaptureFactory = Callable[[int], Any]


def open_default_capture(camera_index: int) -> cv2.VideoCapture:
    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    return cv2.VideoCapture(camera_index, backend)


@dataclass(frozen=True)
class CameraStatus:
    running: bool
    camera_index: int
    width: int
    height: int
    fps: int
    last_error: str | None


@dataclass(frozen=True)
class LandmarkSnapshot:
    running: bool
    detection_available: bool
    detection_error: str | None
    frame_sequence: int
    hands: tuple[DetectedHand, ...]


@dataclass(frozen=True)
class FaceSnapshot:
    running: bool
    detection_available: bool
    detection_error: str | None
    frame_sequence: int
    faces: tuple[DetectedFace, ...]
    expression: SmoothedExpression | None


def mjpeg_part(jpeg_bytes: bytes) -> bytes:
    header = (
        f"--{MJPEG_BOUNDARY}\r\n"
        "Content-Type: image/jpeg\r\n"
        f"Content-Length: {len(jpeg_bytes)}\r\n\r\n"
    ).encode("ascii")
    return header + jpeg_bytes + b"\r\n"


class CameraService:
    def __init__(
        self,
        settings: Settings,
        capture_factory: CaptureFactory = open_default_capture,
        detector_factory: HandDetectorFactory | None = None,
        face_detector_factory: FaceDetectorFactory | None = None,
    ) -> None:
        self._settings = settings
        self._capture_factory = capture_factory
        self._detector_factory = detector_factory
        self._face_detector_factory = face_detector_factory
        self._detector: HandDetector | None = None
        self._face_detector: FaceDetector | None = None
        self._control_lock = threading.Lock()
        self._frame_condition = threading.Condition()
        self._threads: list[threading.Thread] = []
        self._stop_event = threading.Event()
        self._active = False
        self._raw_frame: np.ndarray | None = None
        self._raw_sequence = 0
        self._latest_frame: bytes | None = None
        self._frame_sequence = 0
        self._latest_hands: tuple[DetectedHand, ...] | None = None
        self._latest_faces: tuple[DetectedFace, ...] | None = None
        self._latest_expression: SmoothedExpression | None = None
        self._expression_smoother = ExpressionSmoother()
        self._last_error: str | None = None
        self._detection_error: str | None = (
            None if detector_factory is not None else DETECTION_DISABLED_MESSAGE
        )
        self._face_detection_error: str | None = (
            None if face_detector_factory is not None else FACE_DETECTION_DISABLED_MESSAGE
        )

    @property
    def is_running(self) -> bool:
        with self._frame_condition:
            return self._active

    def status(self) -> CameraStatus:
        with self._frame_condition:
            active = self._active
            last_error = self._last_error
        return CameraStatus(
            running=active,
            camera_index=self._settings.camera_index,
            width=self._settings.camera_width,
            height=self._settings.camera_height,
            fps=self._settings.camera_fps,
            last_error=last_error,
        )

    def landmark_snapshot(self) -> LandmarkSnapshot:
        with self._frame_condition:
            running = self._active
            hands = self._latest_hands if running and self._latest_hands is not None else ()
            return LandmarkSnapshot(
                running=running,
                detection_available=self._detector is not None,
                detection_error=self._detection_error,
                frame_sequence=self._frame_sequence,
                hands=hands,
            )

    def face_snapshot(self) -> FaceSnapshot:
        with self._frame_condition:
            running = self._active
            faces = self._latest_faces if running and self._latest_faces is not None else ()
            expression = self._latest_expression if running else None
            return FaceSnapshot(
                running=running,
                detection_available=self._face_detector is not None,
                detection_error=self._face_detection_error,
                frame_sequence=self._frame_sequence,
                faces=faces,
                expression=expression,
            )

    def start(self) -> CameraStatus:
        with self._control_lock:
            if self.is_running:
                return self.status()
            self._join_threads()
            capture = self._open_capture()
            detector = self._load_detector()
            face_detector = self._load_face_detector()
            self._stop_event = threading.Event()
            self._expression_smoother.reset()
            with self._frame_condition:
                self._active = True
                self._last_error = None
                self._raw_frame = None
                self._latest_frame = None
                self._latest_hands = None
                self._latest_faces = None
                self._latest_expression = None
            self._threads = [
                threading.Thread(
                    target=self._capture_loop,
                    args=(capture, self._stop_event),
                    name="signbridge-camera",
                    daemon=True,
                ),
                threading.Thread(
                    target=self._processing_loop,
                    args=(detector, face_detector, self._stop_event),
                    name="signbridge-processing",
                    daemon=True,
                ),
            ]
            for thread in self._threads:
                thread.start()
            logger.info("Camera %d started", self._settings.camera_index)
        return self.status()

    def stop(self) -> CameraStatus:
        with self._control_lock:
            self._stop_event.set()
            self._join_threads()
        return self.status()

    def shutdown(self) -> None:
        self.stop()
        if any(thread.is_alive() for thread in self._threads):
            logger.error("Camera threads are still running; leaving the detectors open to avoid a crash.")
            return
        if self._detector is not None:
            self._detector.close()
            self._detector = None
        if self._face_detector is not None:
            self._face_detector.close()
            self._face_detector = None

    def iter_mjpeg_frames(self) -> Iterator[bytes]:
        last_sequence = -1
        while True:
            with self._frame_condition:
                self._frame_condition.wait_for(
                    lambda: not self._active or self._frame_sequence != last_sequence,
                    timeout=STREAM_WAIT_SECONDS,
                )
                if not self._active:
                    return
                if self._frame_sequence == last_sequence or self._latest_frame is None:
                    continue
                last_sequence = self._frame_sequence
                frame = self._latest_frame
            yield mjpeg_part(frame)

    def _open_capture(self) -> Any:
        capture = self._capture_factory(self._settings.camera_index)
        if not capture.isOpened():
            capture.release()
            raise CameraUnavailableError(
                "The webcam could not be opened. It may be missing, disabled, "
                "or in use by another application. On Windows, also check "
                "Settings > Privacy & security > Camera."
            )

        capture.set(cv2.CAP_PROP_FRAME_WIDTH, self._settings.camera_width)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self._settings.camera_height)
        capture.set(cv2.CAP_PROP_FPS, self._settings.camera_fps)

        ok, _ = capture.read()
        if not ok:
            capture.release()
            raise CameraUnavailableError(
                "The webcam opened but did not deliver any frames. Camera access "
                "may be blocked by privacy settings or the device may be in use."
            )
        return capture

    def _load_detector(self) -> HandDetector | None:
        if self._detector is None and self._detector_factory is not None:
            try:
                self._detector = self._detector_factory()
                self._set_detection_error(None)
            except HandDetectionUnavailableError as error:
                logger.error("Hand detection unavailable: %s", error.message)
                self._set_detection_error(error.message)
        return self._detector

    def _load_face_detector(self) -> FaceDetector | None:
        if self._face_detector is None and self._face_detector_factory is not None:
            try:
                self._face_detector = self._face_detector_factory()
                self._set_face_detection_error(None)
            except Exception as error:
                logger.error("Face detection unavailable: %s", error)
                self._set_face_detection_error(str(error))
        return self._face_detector

    def _capture_loop(self, capture: Any, stop_event: threading.Event) -> None:
        frame_interval = 1.0 / self._settings.camera_fps
        consecutive_failures = 0
        try:
            while not stop_event.is_set():
                started = time.monotonic()
                ok, frame = capture.read()
                if not ok or frame is None:
                    consecutive_failures += 1
                    if consecutive_failures >= self._settings.camera_max_read_failures:
                        self._record_error(
                            "The webcam stopped delivering frames. It may have been "
                            "disconnected or taken over by another application."
                        )
                        return
                    stop_event.wait(READ_RETRY_DELAY_SECONDS)
                    continue

                consecutive_failures = 0
                self._publish_raw_frame(frame)

                remaining = frame_interval - (time.monotonic() - started)
                if remaining > 0:
                    stop_event.wait(remaining)
        except Exception:
            logger.exception("Camera capture loop failed")
            self._record_error("Camera capture failed unexpectedly. See backend logs.")
        finally:
            capture.release()
            with self._frame_condition:
                self._active = False
                self._raw_frame = None
                self._latest_frame = None
                self._latest_hands = None
                self._latest_faces = None
                self._latest_expression = None
                self._frame_condition.notify_all()
            logger.info("Camera %d released", self._settings.camera_index)

    def _processing_loop(
        self,
        detector: HandDetector | None,
        face_detector: FaceDetector | None,
        stop_event: threading.Event,
    ) -> None:
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, self._settings.camera_jpeg_quality]
        last_sequence = 0
        while True:
            with self._frame_condition:
                self._frame_condition.wait_for(
                    lambda: stop_event.is_set() or not self._active or self._raw_sequence != last_sequence,
                    timeout=STREAM_WAIT_SECONDS,
                )
                if stop_event.is_set() or not self._active:
                    return
                if self._raw_sequence == last_sequence or self._raw_frame is None:
                    continue
                last_sequence = self._raw_sequence
                frame = self._raw_frame

            hands: tuple[DetectedHand, ...] | None = None
            annotated = frame
            try:
                if detector is not None:
                    result = detector.detect(frame)
                    hands = result.hands
                    annotated = detector.annotate(frame, result)
            except Exception:
                logger.exception("Frame processing failed")
                self._set_detection_error("Hand detection failed on a frame. See backend logs.")
                hands = None
                annotated = frame

            faces: tuple[DetectedFace, ...] | None = None
            expression: SmoothedExpression | None = None
            try:
                if face_detector is not None:
                    face_result = face_detector.detect(frame)
                    faces = face_result.faces
                    expression = self._expression_for(faces)
                    annotated = face_detector.annotate(annotated, face_result)
            except Exception:
                logger.exception("Face processing failed")
                self._set_face_detection_error("Facial tracking failed on a frame. See backend logs.")
                faces = None
                expression = None

            try:
                encoded, buffer = cv2.imencode(".jpg", annotated, encode_params)
                if encoded:
                    self._publish_processed_frame(
                        buffer.tobytes(),
                        hands,
                        faces=faces,
                        expression=expression,
                    )
            except Exception:
                logger.exception("Frame encoding failed")

    def _expression_for(self, faces: tuple[DetectedFace, ...]) -> SmoothedExpression | None:
        if not faces:
            self._expression_smoother.reset()
            return None
        blendshapes = faces[0].blendshapes
        if blendshapes is None:
            self._expression_smoother.reset()
            return None
        return self._expression_smoother.push(classify_expression(blendshapes))

    def _publish_raw_frame(self, frame: np.ndarray) -> None:
        with self._frame_condition:
            self._raw_frame = frame
            self._raw_sequence += 1
            self._frame_condition.notify_all()

    def _publish_processed_frame(
        self,
        jpeg_bytes: bytes,
        hands: tuple[DetectedHand, ...] | None,
        *,
        faces: tuple[DetectedFace, ...] | None = None,
        expression: SmoothedExpression | None = None,
    ) -> None:
        with self._frame_condition:
            self._latest_frame = jpeg_bytes
            self._latest_hands = hands
            self._latest_faces = faces
            self._latest_expression = expression
            self._frame_sequence += 1
            if hands is not None:
                self._detection_error = None
            if faces is not None:
                self._face_detection_error = None
            self._frame_condition.notify_all()

    def _set_detection_error(self, message: str | None) -> None:
        with self._frame_condition:
            self._detection_error = message

    def _set_face_detection_error(self, message: str | None) -> None:
        with self._frame_condition:
            self._face_detection_error = message

    def _record_error(self, message: str) -> None:
        logger.error(message)
        with self._frame_condition:
            self._last_error = message

    def _join_threads(self) -> None:
        for thread in self._threads:
            thread.join(timeout=STOP_JOIN_TIMEOUT_SECONDS)
            if thread.is_alive():
                logger.warning("Camera thread %s did not exit within %.1fs", thread.name, STOP_JOIN_TIMEOUT_SECONDS)
        self._threads = [thread for thread in self._threads if thread.is_alive()]
