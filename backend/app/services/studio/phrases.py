"""Phrase catalogue for the Studio, read from the project's existing files. Nothing here changes a verification status.

A phrase is recordable only when phrase_vocabulary.json marks its label as verified by a named reviewer on a date.
Anything else, including a missing vocabulary file or an unknown label, is blocked (fail closed).
"""

import json
from pathlib import Path
from typing import Any

REPO_DIR = Path(__file__).resolve().parents[4]
PHRASE_CATALOG = REPO_DIR / "ai-engine" / "training" / "phrase_experiments" / "stage3" / "phrase_catalog.json"
PHRASE_VOCABULARY = REPO_DIR / "ai-engine" / "dataset" / "metadata" / "phrase_vocabulary.json"


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _verification_index(vocabulary: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    if not vocabulary:
        return index
    for entry in vocabulary.get("phrases", []):
        label = str(entry.get("label", "")).strip().lower()
        if label:
            index[label] = entry
    return index


def is_verified(entry: dict[str, Any] | None) -> bool:
    return bool(
        entry
        and entry.get("verified") is True
        and str(entry.get("reviewed_by") or "").strip()
        and str(entry.get("reviewed_on") or "").strip()
    )


def load_catalog(
    catalog_path: Path | None = None, vocabulary_path: Path | None = None
) -> list[dict[str, Any]]:
    catalog = _read_json(catalog_path or PHRASE_CATALOG) or {}
    index = _verification_index(_read_json(vocabulary_path or PHRASE_VOCABULARY))
    phrases = []
    for item in catalog.get("phrases", []):
        label = str(item["phrase_label"])
        entry = index.get(label.strip().lower())
        verified = is_verified(entry)
        if verified:
            reason = None
        elif entry is None:
            reason = "This label is not in the phrase vocabulary, so it is blocked."
        else:
            reason = (
                "Unverified: no qualified reviewer has verified this label against an ISL reference. "
                "Recording stays blocked until it is verified."
            )
        phrases.append({
            "phrase_id": item["phrase_id"],
            "label": label,
            "verified": verified,
            "recording_blocked": not verified,
            "blocked_reason": reason,
        })
    return phrases


def find(phrases: list[dict[str, Any]], phrase_id: str) -> dict[str, Any] | None:
    return next((p for p in phrases if p["phrase_id"] == phrase_id), None)
