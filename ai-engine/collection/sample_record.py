"""Pure helpers for labelled landmark samples. No camera or MediaPipe imports, so these run in unit tests.

Only landmark coordinates are stored. Frames and video are never written.
"""

import json
import re
from pathlib import Path
from typing import Any

LANDMARK_COUNT = 21
VALID_HANDEDNESS = {"Left", "Right"}
PARTICIPANT_PATTERN = re.compile(r"^P\d{3}$")
CONSENT_REF_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$")


def load_vocabulary(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def verified_classes(vocabulary: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Return only classes a human has verified against a named reference."""
    verified: dict[str, dict[str, Any]] = {}
    for entry in vocabulary.get("classes", []):
        label = entry.get("label", "")
        if entry.get("verified") is True and str(entry.get("reference", "")).strip() and label:
            verified[label] = entry
    return verified


def validate_participant(participant: str) -> str:
    if not PARTICIPANT_PATTERN.match(participant):
        raise ValueError("Participant ID must be a pseudonym like P001. Do not use names.")
    return participant


def validate_consent_ref(consent_ref: str) -> str:
    if not CONSENT_REF_PATTERN.match(consent_ref):
        raise ValueError(
            "Consent reference must identify the signed consent record (for example C-2026-001). "
            "Do not put names in it."
        )
    return consent_ref


def accept_hands(hands: list[dict[str, Any]], expected_hands: int, min_score: float) -> bool:
    """Accept a frame only when it has exactly the hands the class needs, all confident and complete."""
    if len(hands) != expected_hands:
        return False
    for hand in hands:
        if hand.get("handedness") not in VALID_HANDEDNESS:
            return False
        if float(hand.get("score", 0.0)) < min_score:
            return False
        if len(hand.get("landmarks", [])) != LANDMARK_COUNT:
            return False
    return True


def build_sample(
    *,
    label: str,
    participant: str,
    session_id: str,
    sample_index: int,
    captured_at: str,
    hands: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build one JSON-serialisable sample. Coordinates are rounded to keep files small."""
    return {
        "label": label,
        "participant": participant,
        "session": session_id,
        "sample_index": sample_index,
        "captured_at": captured_at,
        "hands": [
            {
                "handedness": hand["handedness"],
                "score": round(float(hand["score"]), 4),
                "landmarks": [
                    [round(float(x), 6), round(float(y), 6), round(float(z), 6)]
                    for x, y, z in hand["landmarks"]
                ],
            }
            for hand in hands
        ],
    }

