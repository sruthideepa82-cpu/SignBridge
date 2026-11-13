import numpy as np
from fastapi import APIRouter, Query

from app.api.dependencies import CameraServiceDep, PhraseRecognizerDep
from app.schemas.phrase import PhraseModelResponse, PhraseRecognitionResponse

router = APIRouter(prefix="/recognition/phrase", tags=["recognition"])


@router.get("/model", response_model=PhraseModelResponse)
def phrase_model(recognizer: PhraseRecognizerDep) -> PhraseModelResponse:
    """What the phrase model can recognise, and the phrases it excludes (dynamic or undetermined)."""
    return PhraseModelResponse(
        available=recognizer.available,
        error=recognizer.error,
        labels=recognizer.labels,
        excluded_phrases=recognizer.excluded_phrases,
        threshold=recognizer.threshold,
        experimental=recognizer.experimental,
        verification=recognizer.verification,
        citation=recognizer.citation,
        limitations=recognizer.limitations,
    )


@router.get("/latest", response_model=PhraseRecognitionResponse)
def latest_phrase(
    camera: CameraServiceDep,
    recognizer: PhraseRecognizerDep,
    phrase: str | None = Query(default=None, max_length=60, description="Optional phrase the user is signing."),
) -> PhraseRecognitionResponse:
    """Classify the newest processed frame with the phrase model. Separate from the alphabet endpoint.

    When `phrase` names a phrase that is excluded (dynamic, needs movement) or unknown, the answer is
    `unsupported` and no phrase is predicted for it.
    """
    snapshot = camera.landmark_snapshot()
    base = {
        "threshold": recognizer.threshold,
        "frame_sequence": snapshot.frame_sequence,
        "experimental": recognizer.experimental,
        "verification": recognizer.verification,
    }

    if phrase is not None:
        key = phrase.strip().lower()
        if key in recognizer.excluded_phrases:
            return PhraseRecognitionResponse(
                status="unsupported",
                detail=f"'{key}' needs movement and is not supported by the static phrase model: {recognizer.excluded_phrases[key]}.",
                **base,
            )
        if recognizer.available and key not in recognizer.labels:
            return PhraseRecognitionResponse(status="unsupported", detail=f"'{key}' is not in the phrase model.", **base)

    if not snapshot.running:
        return PhraseRecognitionResponse(status="camera_off", **base)
    if not recognizer.available:
        return PhraseRecognitionResponse(status="no_model", detail=recognizer.error, **base)
    if len(snapshot.hands) == 0:
        return PhraseRecognitionResponse(status="no_hand", **base)

    landmarks = np.zeros((2, 21, 3))
    present = [False, False]
    for hand in snapshot.hands:
        slot = 0 if hand.handedness == "Left" else 1
        if present[slot]:
            continue
        landmarks[slot] = [[p.x, p.y, p.z] for p in hand.landmarks]
        present[slot] = True
    prediction = recognizer.predict(landmarks, present)
    if prediction is None:
        return PhraseRecognitionResponse(status="no_hand", detail="No hand could be normalized.", **base)
    if not prediction.accepted:
        return PhraseRecognitionResponse(status="uncertain", confidence=prediction.confidence, **base)
    return PhraseRecognitionResponse(
        status="recognized",
        label=prediction.label,
        confidence=prediction.confidence,
        **base,
    )
