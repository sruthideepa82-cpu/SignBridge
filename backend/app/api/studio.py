"""Dataset Collection Studio API (Stage 5B). Local operator only.

Every route requires:
  - a client address on this computer (127.0.0.1, ::1),
  - a Host header naming localhost or a loopback address (defends against DNS rebinding),
  - the custom header X-Studio-Client: studio, which other sites cannot send because CORS does not allow it.

No route here captures camera data or creates a recording. Recording creation is a later sub-stage.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from app.schemas.studio import (
    AuditEventOut,
    ConsentCreate,
    ConsentWithdraw,
    DashboardOut,
    GateOut,
    ParticipantCreate,
    ParticipantOut,
    PhraseOut,
    RecordingCheck,
    StatusOut,
)
from app.services.studio import gate, phrases, validation
from app.services.studio.errors import StudioError, StudioForbidden, StudioNotFound
from app.services.studio.store import DEFAULT_DB_PATH, StudioStore

LOOPBACK = {"127.0.0.1", "::1", "localhost"}
CLIENT_HEADER = "x-studio-client"
CLIENT_HEADER_VALUE = "studio"
STUDIO_BINDING = "127.0.0.1 only (local operator)"

router = APIRouter(prefix="/studio", tags=["studio"])


def _host_name(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("["):
        return raw[1:raw.find("]")] if "]" in raw else ""
    return raw.split(":")[0]


def require_local_operator(request: Request) -> None:
    client = request.client.host if request.client else ""
    if client not in LOOPBACK:
        raise StudioForbidden("The Studio is only available from this computer.")
    if _host_name(request.headers.get("host", "")) not in LOOPBACK:
        raise StudioForbidden("The Studio only accepts requests addressed to localhost.")
    if request.headers.get(CLIENT_HEADER) != CLIENT_HEADER_VALUE:
        raise StudioForbidden("The Studio client header is missing.")


def get_store(request: Request) -> StudioStore:
    store = StudioStore(getattr(request.app.state, "studio_db_path", None) or DEFAULT_DB_PATH)
    store.initialise()
    return store


Guard = Depends(require_local_operator)
StoreDep = Annotated[StudioStore, Depends(get_store)]


def _recording_flag_state() -> tuple[bool, str]:
    enabled = gate.recording_enabled()
    if enabled:
        return True, "Recording flag is set. Each recording still needs every gate condition to pass."
    return False, "PARTICIPANT COLLECTION DISABLED. Only the project owner can enable recording."


@router.get("/status", response_model=StatusOut, dependencies=[Guard])
def studio_status(store: StoreDep) -> StatusOut:
    enabled, message = _recording_flag_state()
    return StatusOut(
        participant_collection="enabled" if enabled else "disabled",
        recording_enabled=enabled,
        recording_flag=gate.RECORDING_FLAG,
        binding=STUDIO_BINDING,
        schema_version=store.schema_version(),
        message=message,
    )


@router.get("/dashboard", response_model=DashboardOut, dependencies=[Guard])
def dashboard(store: StoreDep) -> DashboardOut:
    return DashboardOut(counts=store.dashboard(), source="local Studio database (metadata only)")


@router.get("/participants", response_model=list[ParticipantOut], dependencies=[Guard])
def list_participants(store: StoreDep) -> list[ParticipantOut]:
    return [ParticipantOut(**row) for row in store.list_participants()]


@router.post("/participants", response_model=ParticipantOut, status_code=201, dependencies=[Guard])
def register_participant(payload: ParticipantCreate, store: StoreDep) -> ParticipantOut:
    code = validation.participant_code(payload.participant_code)
    created = store.register_participant(code)
    return ParticipantOut(**created)


@router.get("/participants/{code}", dependencies=[Guard])
def get_participant(code: str, store: StoreDep) -> dict[str, Any]:
    checked = validation.participant_code(code)
    found = store.get_participant(checked)
    if found is None:
        raise StudioNotFound("No participant with this code is registered.")
    found["consents"] = [_consent_view(c) for c in found["consents"]]
    return found


@router.get("/consents", dependencies=[Guard])
def list_consents(store: StoreDep) -> list[dict[str, Any]]:
    return [_consent_view(c) for c in store.list_consents()]


@router.post("/participants/{code}/consents", status_code=201, dependencies=[Guard])
def record_consent(code: str, payload: ConsentCreate, store: StoreDep) -> dict[str, Any]:
    checked = validation.participant_code(code)
    consent_id = validation.consent_id(payload.consent_id)
    form = validation.form_version(payload.form_version)
    document = validation.document_reference(payload.document_ref)
    if payload.status == "granted":
        if not payload.scope_landmarks:
            raise StudioError("Consent can only be granted when the signed form covers landmark collection.")
        authorised = validation.reviewer_id(payload.authorized_by)
        research_use = "internal_research_only"
    else:
        if payload.scope_landmarks:
            raise StudioError("Only a granted consent can cover landmark collection.")
        authorised = None
        research_use = "none"
    record = {
        "consent_id": consent_id,
        "status": payload.status,
        "form_version": form,
        "scope_landmarks": 1 if payload.scope_landmarks else 0,
        "research_use": research_use,
        "document_ref": document,
        "authorized_by": authorised,
        "note": payload.note,
    }
    return store.add_consent(checked, record)


@router.post("/participants/{code}/consents/withdraw", status_code=201, dependencies=[Guard])
def withdraw_consent(code: str, payload: ConsentWithdraw, store: StoreDep) -> dict[str, Any]:
    checked = validation.participant_code(code)
    consent_id = validation.consent_id(payload.consent_id)
    document = validation.document_reference(payload.document_ref)
    return store.withdraw_consent(checked, consent_id, document, payload.note)


@router.get("/phrases", response_model=list[PhraseOut], dependencies=[Guard])
def list_phrases() -> list[PhraseOut]:
    return [PhraseOut(**p) for p in phrases.load_catalog()]


@router.post("/recording-checks", response_model=GateOut, dependencies=[Guard])
def recording_check(payload: RecordingCheck, store: StoreDep) -> GateOut:
    """Evaluates the eligibility gate. Never creates a recording and never touches the camera."""
    enabled = gate.recording_enabled()
    result = gate.evaluate(
        store,
        participant=payload.participant_code,
        consent_ref=payload.consent_ref,
        phrase_id=payload.phrase_id,
        enabled=enabled,
    )
    outcome = "ok" if result["eligible"] else "refused"
    detail = ",".join(r["code"] for r in result["reasons"]) or "eligible"
    store.record_event("recording.check", "recording", payload.phrase_id or "none", outcome, detail)
    return GateOut(**result)


@router.get("/sessions", dependencies=[Guard])
def list_sessions(store: StoreDep) -> list[dict[str, Any]]:
    return store.list_sessions()


@router.get("/recordings", dependencies=[Guard])
def list_recordings(store: StoreDep) -> list[dict[str, Any]]:
    return store.list_recordings()


@router.get("/reviews", dependencies=[Guard])
def list_reviews(store: StoreDep) -> list[dict[str, Any]]:
    return store.list_reviews()


@router.get("/dataset-versions", dependencies=[Guard])
def list_dataset_versions(store: StoreDep) -> list[dict[str, Any]]:
    return store.list_dataset_versions()


@router.get("/audit", response_model=list[AuditEventOut], dependencies=[Guard])
def audit(store: StoreDep, limit: Annotated[int, Query(ge=1, le=200)] = 50) -> list[AuditEventOut]:
    return [AuditEventOut(**row) for row in store.list_audit(limit)]


def _consent_view(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "sequence": row.get("sequence"),
        "consent_id": row["consent_id"],
        "participant_code": row.get("participant_code"),
        "status": row["status"],
        "form_version": row.get("form_version"),
        "scope_landmarks": bool(row.get("scope_landmarks")),
        "research_use": row.get("research_use"),
        "document_ref": row.get("document_ref"),
        "authorized_by": row.get("authorized_by"),
        "supersedes_consent_id": row.get("supersedes_consent_id"),
        "note": row.get("note"),
        "recorded_at": row.get("recorded_at"),
        "recorded_by": row.get("recorded_by"),
    }


