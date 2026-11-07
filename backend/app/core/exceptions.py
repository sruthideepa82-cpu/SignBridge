class SignBridgeError(Exception):
    """Base class for errors that map to a structured JSON API response."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class CameraUnavailableError(SignBridgeError):
    status_code = 503
    code = "camera_unavailable"


class CameraNotRunningError(SignBridgeError):
    status_code = 409
    code = "camera_not_running"


class HandDetectionUnavailableError(SignBridgeError):
    status_code = 503
    code = "hand_detection_unavailable"
