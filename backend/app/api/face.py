from fastapi import APIRouter

from app.api.dependencies import CameraServiceDep
from app.schemas.face import FaceExpressionResponse, FaceExpressionScores
from app.services.camera_service import CameraService, FaceSnapshot

router = APIRouter(prefix="/face", tags=["face"])


def face_status(snapshot: FaceSnapshot) -> str:
    if not snapshot.running:
        return "camera_off"
    if not snapshot.detection_available:
        return "detection_unavailable"
    if snapshot.detection_error:
        return "processing_error"
    if snapshot.faces:
        return "face_detected"
    return "no_face"


@router.get("/latest", response_model=FaceExpressionResponse)
def latest_face(camera: CameraServiceDep) -> FaceExpressionResponse:
    snapshot: FaceSnapshot = camera.face_snapshot()
    expression = snapshot.expression if snapshot.faces else None
    return FaceExpressionResponse(
        status=face_status(snapshot),
        running=snapshot.running,
        detection_available=snapshot.detection_available,
        detection_error=snapshot.detection_error,
        frame_sequence=snapshot.frame_sequence,
        face_count=len(snapshot.faces),
        landmark_count=snapshot.faces[0].landmark_count if snapshot.faces else 0,
        expression=expression.label if expression else None,
        strength=expression.strength if expression else None,
        scores=FaceExpressionScores(**expression.scores) if expression else None,
        frames_smoothed=expression.frames if expression else 0,
    )
