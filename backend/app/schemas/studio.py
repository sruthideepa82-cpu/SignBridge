from typing import Any, Literal

from pydantic import BaseModel, Field


class ParticipantCreate(BaseModel):
    participant_code: str = Field(min_length=4, max_length=4, description="Pseudonym such as P001. No names.")


class ConsentCreate(BaseModel):
    consent_id: str = Field(min_length=10, max_length=10, description="Consent reference such as C-2026-001.")
    status: Literal["pending", "granted", "declined"]
    form_version: str = Field(min_length=1, max_length=40)
    scope_landmarks: bool = Field(description="True only when the signed form covers landmark collection.")
    document_ref: str = Field(min_length=3, max_length=120, description="Short label for the signed form. Not a path.")
    authorized_by: str | None = Field(default=None, max_length=6, description="Reviewer ID such as REV-01.")
    note: str = Field(default="", max_length=200)


class ConsentWithdraw(BaseModel):
    consent_id: str = Field(min_length=10, max_length=10, description="New reference for this withdrawal record.")
    document_ref: str = Field(min_length=3, max_length=120)
    note: str = Field(default="", max_length=200)


class RecordingCheck(BaseModel):
    participant_code: str | None = Field(default=None, max_length=16)
    consent_ref: str | None = Field(default=None, max_length=32)
    phrase_id: str | None = Field(default=None, max_length=8)


class ErrorDetail(BaseModel):
    code: str
    message: str


class StatusOut(BaseModel):
    participant_collection: Literal["disabled", "enabled"]
    recording_enabled: bool
    recording_flag: str
    binding: str
    schema_version: int
    message: str


class DashboardOut(BaseModel):
    counts: dict[str, int]
    source: str


class ParticipantOut(BaseModel):
    participant_code: str
    created_at: str
    consent_status: str | None = None


class ConsentOut(BaseModel):
    sequence: int | None = None
    consent_id: str
    participant_code: str | None = None
    status: str
    form_version: str | None = None
    scope_landmarks: int | None = None
    research_use: str | None = None
    document_ref: str | None = None
    authorized_by: str | None = None
    supersedes_consent_id: str | None = None
    note: str | None = None
    recorded_at: str | None = None
    recorded_by: str | None = None


class PhraseOut(BaseModel):
    phrase_id: str
    label: str
    verified: bool
    recording_blocked: bool
    blocked_reason: str | None = None


class GateReason(BaseModel):
    code: str
    message: str


class GateOut(BaseModel):
    eligible: bool
    reasons: list[GateReason]
    recording_enabled: bool


class AuditEventOut(BaseModel):
    event_id: int
    occurred_at: str
    action: str
    entity_type: str
    entity_id: str
    outcome: str
    detail: str


def as_dict(model: BaseModel) -> dict[str, Any]:
    return model.model_dump()
