"""Input validation for the Studio. Participant and consent-reference rules come from the existing collection code
(ai-engine/collection/sample_record.py), so both collection paths enforce the same format."""

import re
import sys
from pathlib import Path

from app.services.studio.errors import StudioError

COLLECTION_DIR = Path(__file__).resolve().parents[4] / "ai-engine" / "collection"
if str(COLLECTION_DIR) not in sys.path:
    sys.path.insert(0, str(COLLECTION_DIR))

from sample_record import validate_participant as _validate_participant  # noqa: E402

CONSENT_ID_PATTERN = re.compile(r"^C-\d{4}-\d{3}$")
REVIEWER_PATTERN = re.compile(r"^REV-\d{2}$")
FORM_VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$")
DOCUMENT_REF_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._()-]{2,119}$")
PHRASE_ID_PATTERN = re.compile(r"^DYN-\d{2}$")


def participant_code(value: str | None) -> str:
    if not value:
        raise StudioError("A participant code is required.")
    try:
        return _validate_participant(value)
    except ValueError as error:
        raise StudioError(str(error)) from error


def consent_id(value: str | None) -> str:
    if not value:
        raise StudioError("A consent reference is required.")
    if not CONSENT_ID_PATTERN.match(value):
        raise StudioError("The consent reference must look like C-2026-001. Do not put names in it.")
    return value


def reviewer_id(value: str | None) -> str:
    if not value or not REVIEWER_PATTERN.match(value):
        raise StudioError("The authorised reviewer must look like REV-01.")
    return value


def form_version(value: str) -> str:
    if not FORM_VERSION_PATTERN.match(value):
        raise StudioError("The consent form version must be a short code such as v1 or 2026-11.")
    return value


def document_reference(value: str) -> str:
    """A reference to the signed paper or file held outside the repository. Paths are refused."""
    if not DOCUMENT_REF_PATTERN.match(value) or ".." in value:
        raise StudioError(
            "The document reference must be a short label for the signed form, for example 'Form v1 signed 2026-11-20'. "
            "Do not enter file paths or names."
        )
    return value


def phrase_id(value: str | None) -> str:
    if not value:
        raise StudioError("A phrase ID is required.")
    if not PHRASE_ID_PATTERN.match(value):
        raise StudioError("The phrase ID must look like DYN-01.")
    return value
