from fastapi import APIRouter

from app.api.dependencies import CameraServiceDep
from app.schemas.face import FaceExpressionResponse, FaceExpressionScores, FaceResponse
from app.services.camera_service import FaceSnapshot
from app.services.face_detection_service import DetectedFace

router = APIRouter(prefix="/face", tags=["face"])

COORDINATE_DECIMALS = 4


def rounded(value: float) -> float:
    return round(value, COORDINATE_DECIMALS)


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


def partially_outside(bbox: tuple[float, float, float, float]) -> bool:
    xmin, ymin, xmax, ymax = bbox
    return xmin < 0.0 or ymin < 0.0 or xmax > 1.0 or ymax > 1.0


def to_face_response(face: DetectedFace) -> FaceResponse:
    blendshapes = None
    if face.blendshapes is not None:
        blendshapes = {name: rounded(score) for name, score in face.blendshapes.items()}
    return FaceResponse(
        bbox=[rounded(value) for value in face.bbox],
        partially_outside_frame=partially_outside(face.bbox),
        landmarks=[[rounded(x), rounded(y)] for x, y in face.points],
        blendshapes=blendshapes,
    )


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
        faces=[to_face_response(face) for face in snapshot.faces],
        expression=expression.label if expression else None,
        strength=expression.strength if expression else None,
        scores=FaceExpressionScores(**expression.scores) if expression else None,
        frames_smoothed=expression.frames if expression else 0,
    )
