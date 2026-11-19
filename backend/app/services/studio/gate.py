"""Server-side recording eligibility gate. Stage 5B evaluates the gate but never creates a recording.

Every rule is enforced here, on the server. The frontend shows these results but cannot bypass them.
Reasons are returned all together, so the operator sees every blocker at once.
"""

import os
from dataclasses import dataclass
from typing import Any

from app.services.studio import phrases, validation
from app.services.studio.errors import StudioError
from app.services.studio.store import StudioStore

RECORDING_FLAG = "SIGNBRIDGE_STUDIO_RECORDING_ENABLED"


def recording_enabled(environ: dict[str, str] | None = None) -> bool:
    """Fail closed. Only the exact value 'true' enables recording. Missing, empty or any other value is disabled."""
    source = os.environ if environ is None else environ
    return source.get(RECORDING_FLAG, "") == "true"


@dataclass(frozen=True)
class Reason:
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


def evaluate(
    store: StudioStore,
    *,
    participant: str | None,
    consent_ref: str | None,
    phrase_id: str | None,
    enabled: bool,
    catalog: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    reasons: list[Reason] = []
    participant_ok = False
    participant_code = None

    if not participant:
        reasons.append(Reason("participant_missing", "Enter a participant code."))
    else:
        try:
            participant_code = validation.participant_code(participant)
            participant_ok = True
        except StudioError:
            reasons.append(Reason(
                "participant_invalid",
                "The participant code must be a pseudonym such as P001. Names are not accepted.",
            ))

    if participant_ok and store.get_participant(participant_code) is None:
        reasons.append(Reason("participant_not_registered", "This participant is not registered in the Studio."))
        participant_ok = False

    if not consent_ref:
        reasons.append(Reason("consent_reference_missing", "A consent reference is required."))
    else:
        try:
            validation.consent_id(consent_ref)
        except StudioError:
            reasons.append(Reason("consent_reference_invalid", "The consent reference format is not valid."))
            consent_ref = None

    if participant_ok and consent_ref:
        consent_reason = _consent_reasons(store, participant_code, consent_ref)
        reasons.extend(consent_reason)

    if phrase_id is None or phrase_id == "":
        reasons.append(Reason("phrase_missing", "Choose a phrase."))
    else:
        items = catalog if catalog is not None else phrases.load_catalog()
        entry = phrases.find(items, phrase_id)
        if entry is None:
            reasons.append(Reason("phrase_unknown", "This phrase is not in the Studio catalogue."))
        elif entry["recording_blocked"]:
            reasons.append(Reason("phrase_unverified", f"'{entry['label']}' is blocked. {entry['blocked_reason']}"))

    if not enabled:
        reasons.append(Reason(
            "recording_disabled",
            "Participant collection is disabled. Only the project owner can enable it.",
        ))

    return {
        "eligible": not reasons,
        "reasons": [r.as_dict() for r in reasons],
        "recording_enabled": enabled,
    }


def _consent_reasons(store: StudioStore, participant_code: str, consent_ref: str) -> list[Reason]:
    reasons: list[Reason] = []
    with store.connection() as conn:
        record = store.consent_by_id(conn, consent_ref)
        latest = store.latest_consent(conn, participant_code)
    if record is None:
        return [Reason("consent_not_found", "No consent record has this reference.")]
    if record["participant_code"] != participant_code:
        return [Reason("consent_not_for_participant", "This consent record belongs to a different participant.")]
    if latest is not None and latest["consent_id"] != consent_ref:
        reasons.append(Reason(
            "consent_superseded",
            "This consent record is not the participant's latest. Only the latest record can be used.",
        ))
    if latest is not None and latest["status"] == "withdrawn":
        reasons.append(Reason("consent_withdrawn", "This participant has withdrawn consent. No recording is allowed."))
    if record["status"] == "withdrawn":
        reasons.append(Reason("consent_withdrawn", "This consent record is a withdrawal, not a grant."))
    elif record["status"] != "granted":
        reasons.append(Reason("consent_not_granted", f"Consent status is '{record['status']}', not 'granted'."))
    if record["scope_landmarks"] != 1:
        reasons.append(Reason("consent_scope_missing_landmarks", "The consent does not cover landmark collection."))
    if record["research_use"] != "internal_research_only":
        reasons.append(Reason(
            "consent_scope_missing_research_use",
            "The consent does not cover the intended internal research use.",
        ))
    if record["status"] == "granted" and not record["authorized_by"]:
        reasons.append(Reason("consent_reviewer_missing", "The consent has no authorised reviewer."))
    return reasons
