"""Reads frames from a video file instead of a webcam, for development and testing only.

Enabled with SIGNBRIDGE_CAMERA_VIDEO_FILE. The file loops when it ends. It behaves like cv2.VideoCapture
for the methods the camera service uses, so the rest of the pipeline is unchanged.
"""

from pathlib import Path
from typing import Any

import cv2


class LoopingVideoFile:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._capture: Any = cv2.VideoCapture(str(path))

    def isOpened(self) -> bool:
        return self._capture.isOpened()

    def set(self, _prop: int, _value: float) -> bool:
        return True

    def read(self) -> tuple[bool, Any]:
        ok, frame = self._capture.read()
        if not ok:
            self._capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self._capture.read()
        return ok, frame

    def release(self) -> None:
        self._capture.release()
