from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.dependencies import CameraServiceDep
from app.core.exceptions import CameraNotRunningError
from app.schemas.camera import CameraStatusResponse
from app.schemas.hands import HandLandmarksResponse, HandResponse, LandmarkPointResponse
from app.services.camera_service import MJPEG_BOUNDARY, CameraStatus, LandmarkSnapshot
from app.services.hand_detection_service import DetectedHand

router = APIRouter(prefix="/camera", tags=["camera"])

MJPEG_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Accel-Buffering": "no",
}


def to_status_response(status: CameraStatus) -> CameraStatusResponse:
    return CameraStatusResponse(
        running=status.running,
        camera_index=status.camera_index,
        width=status.width,
        height=status.height,
        fps=status.fps,
        last_error=status.last_error,
    )


def to_hand_response(hand: DetectedHand) -> HandResponse:
    return HandResponse(
        handedness=hand.handedness,
        score=hand.score,
        landmarks=[
            LandmarkPointResponse(index=point.index, name=point.name, x=point.x, y=point.y, z=point.z)
            for point in hand.landmarks
        ],
    )


def landmark_status(snapshot: LandmarkSnapshot) -> str:
    if not snapshot.running:
        return "camera_off"
    if not snapshot.detection_available:
        return "detection_unavailable"
    if snapshot.hands:
        return "hand_detected"
    return "no_hand"


@router.get("/status", response_model=CameraStatusResponse)
def camera_status(camera: CameraServiceDep) -> CameraStatusResponse:
    return to_status_response(camera.status())


@router.post("/start", response_model=CameraStatusResponse)
def start_camera(camera: CameraServiceDep) -> CameraStatusResponse:
    return to_status_response(camera.start())


@router.post("/stop", response_model=CameraStatusResponse)
def stop_camera(camera: CameraServiceDep) -> CameraStatusResponse:
    return to_status_response(camera.stop())


@router.get("/landmarks", response_model=HandLandmarksResponse)
def hand_landmarks(camera: CameraServiceDep) -> HandLandmarksResponse:
    snapshot = camera.landmark_snapshot()
    hands = [to_hand_response(hand) for hand in snapshot.hands]
    return HandLandmarksResponse(
        status=landmark_status(snapshot),
        running=snapshot.running,
        detection_available=snapshot.detection_available,
        detection_error=snapshot.detection_error,
        frame_sequence=snapshot.frame_sequence,
        hand_count=len(hands),
        hands=hands,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/stream")
def stream_camera(camera: CameraServiceDep) -> StreamingResponse:
    if not camera.is_running:
        raise CameraNotRunningError("The camera is not running. Start the camera before streaming.")
    return StreamingResponse(
        camera.iter_mjpeg_frames(),
        media_type=f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY}",
        headers=MJPEG_HEADERS,
    )
