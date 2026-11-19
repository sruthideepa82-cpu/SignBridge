from fastapi import APIRouter, WebSocket

from app.api.dependencies import TranscriptionServiceDep
from app.schemas.transcription import TranscriptionStatusResponse

router = APIRouter(prefix="/transcription", tags=["transcription"])


@router.get("/status", response_model=TranscriptionStatusResponse)
def transcription_status(service: TranscriptionServiceDep) -> TranscriptionStatusResponse:
    return service.status()


@router.websocket("/live")
async def live_transcription(websocket: WebSocket, service: TranscriptionServiceDep) -> None:
    # Browsers always send Origin. Refusing an unknown origin stops other sites from spending the server's API quota.
    if not service.origin_allowed(websocket.headers.get("origin")):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    await service.run_connection(websocket)
