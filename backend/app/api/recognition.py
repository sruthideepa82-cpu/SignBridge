from fastapi import APIRouter

from app.api.dependencies import CameraServiceDep, RecognizerDep, SequenceRecognizerDep
from app.schemas.recognition import RecognitionResponse, SequenceResponse, SequenceTopItem
from app.services.sequence_recognizer import MIN_HAND_FRAME_SHARE, build_window

router = APIRouter(prefix="/recognition", tags=["recognition"])


@router.get("/latest", response_model=RecognitionResponse)
def latest_recognition(camera: CameraServiceDep, recognizer: RecognizerDep) -> RecognitionResponse:
    """Classify the newest processed frame. Only one hand is classified at a time.

    This is a single-frame result. Temporal smoothing is added in Phase 5.
    """
    snapshot = camera.landmark_snapshot()
    base = {
        "threshold": recognizer.threshold,
        "frame_sequence": snapshot.frame_sequence,
        "experimental": recognizer.experimental,
        "verification": recognizer.verification,
    }

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


@router.get("/sequence", response_model=SequenceResponse)
def sequence_recognition(camera: CameraServiceDep, recognizer: SequenceRecognizerDep) -> SequenceResponse:
    """Classify the newest window of processed frames with the temporal sign model.

    Both hands are used. The window is the last `window_frames` frames that ran hand detection, laid out
    as in training. A word is returned only when the model clears its threshold.
    """
    snapshot = camera.landmark_snapshot()
    frames = recognizer.window_frames
    base = {
        "threshold": recognizer.threshold,
        "frame_sequence": snapshot.frame_sequence,
        "window_frames": frames,
        "caveat": recognizer.caveat,
    }

    if not snapshot.running:
        return SequenceResponse(status="camera_off", **base)
    if not snapshot.detection_available:
        return SequenceResponse(status="detection_unavailable", detail=snapshot.detection_error, **base)
    if not recognizer.available:
        return SequenceResponse(status="no_model", detail=recognizer.error, **base)

    history = camera.hand_history(frames)
    collected = len(history)
    if collected < frames:
        return SequenceResponse(status="warming_up", collected_frames=collected, **base)

    window, hand_frames = build_window([hands for _, hands in history])
    if hand_frames / frames < MIN_HAND_FRAME_SHARE:
        return SequenceResponse(status="no_hand", collected_frames=collected, hand_frames=hand_frames, **base)

    prediction = recognizer.predict(window)
    return SequenceResponse(
        status=prediction.status,
        word=prediction.word,
        confidence=prediction.confidence,
        top3=[SequenceTopItem(word=item.word, confidence=item.confidence) for item in prediction.top3],
        collected_frames=collected,
        hand_frames=hand_frames,
        **base,
    )
