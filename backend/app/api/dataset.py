"""Developer-only dataset collection routes. They return 404 unless SIGNBRIDGE_DEVELOPER_TOOLS_ENABLED is set."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from app.schemas.dataset import ClipRequest, ClipSummary
from app.services.dataset_store import DatasetError, DatasetStore

router = APIRouter(prefix="/dataset", tags=["dataset"])


def require_developer_tools(request: Request) -> DatasetStore:
    if not request.app.state.settings.developer_tools_enabled:
        raise HTTPException(status_code=404, detail="Not found.")
    return request.app.state.dataset_store


DatasetStoreDep = Annotated[DatasetStore, Depends(require_developer_tools)]


@router.get("/status")
def dataset_status(store: DatasetStoreDep) -> dict:
    return store.status()


@router.post("/clips", response_model=ClipSummary)
def save_clip(payload: ClipRequest, store: DatasetStoreDep) -> ClipSummary:
    frames = [frame.model_dump() for frame in payload.frames]
    try:
        saved = store.save_clip(
            label=payload.label,
            participant=payload.participant,
            consent_ref=payload.consent_ref,
            session=payload.session,
            frames=frames,
        )
    except DatasetError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return ClipSummary(**saved)


@router.get("/export")
def export_dataset(
    store: DatasetStoreDep,
    format: Annotated[Literal["csv", "json"], Query()] = "csv",
) -> Response:
    if format == "csv":
        return Response(
            content=store.export_csv(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="signbridge-landmarks.csv"'},
        )
    return Response(
        content=store.export_json(),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="signbridge-landmarks.json"'},
    )
