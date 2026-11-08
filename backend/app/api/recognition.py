from fastapi import APIRouter

from app.api.dependencies import CameraServiceDep, RecognizerDep
from app.schemas.recognition import RecognitionResponse

router = APIRouter(prefix="/recognition", tags=["recognition"])


@router.get("/latest", response_model=RecognitionResponse)
def latest_recognition(camera: CameraServiceDep, recognizer: RecognizerDep) -> RecognitionResponse:
    """Classify the newest processed frame. Only one hand is classified at a time.

    This is a single-frame result. Temporal smoothing is added in Phase 5.
    """
    snapshot = camera.landmark_snapshot()
    base = {"threshold": recognizer.threshold, "frame_sequence": snapshot.frame_sequence}

    if not snapshot.running:
        return RecognitionResponse(status="camera_off", **base)
    if not recognizer.available:
        return RecognitionResponse(status="no_model", detail=recognizer.error, **base)
    if len(snapshot.hands) == 0:
        return RecognitionResponse(status="no_hand", **base)
    if len(snapshot.hands) > 1:
        return RecognitionResponse(
            status="two_hands",
            detail="Show one hand at a time. The recognizer classifies one-handed letters.",
            **base,
        )

    points = [[point.x, point.y, point.z] for point in snapshot.hands[0].landmarks]
    try:
        prediction = recognizer.predict(points)
    except ValueError as error:
        return RecognitionResponse(status="uncertain", detail=str(error), **base)

    if not prediction.accepted:
        return RecognitionResponse(status="uncertain", confidence=prediction.confidence, **base)
    return RecognitionResponse(
        status="recognized",
        label=prediction.label,
        confidence=prediction.confidence,
        **base,
    )
