"""One-off migration: add A-Z as unverified candidate classes and mark every class unverified.

Run once from the ai-engine folder:  python collection/update_vocabulary_az.py
It rewrites dataset/metadata/vocabulary.json. Nothing here marks a class as verified.
"""

import json
import string
from pathlib import Path

VOCABULARY = Path(__file__).resolve().parents[1] / "dataset" / "metadata" / "vocabulary.json"
TEMPORAL = {"J", "Z"}
PILOT = {"C", "L", "O", "S", "U", "V"}

PROVISIONAL_SOURCE = {
    "id": "USER-CHART",
    "name": "Alphabet and number chart supplied by the project owner (provenance not confirmed)",
    "url": None,
    "checked": "Viewed as an image on 2026-11-11. Not confirmed as the official ISLRTC chart.",
    "notes": (
        "Provisional visual reference only. The convention is not confirmed as ISL, and the chart "
        "resembles a common ASL-style fingerspelling chart. J and Z are drawn with motion arrows. "
        "Do not verify any class from this source alone. Use ISLRTC-ALPHABET as the source of truth."
    ),
}


def class_entry(label: str, existing: dict | None) -> dict:
    temporal = label in TEMPORAL
    entry = {
        "label": label,
        "class_id": f"FS-{label}",
        "type": "temporal" if temporal else "static",
        "recognition_type": "temporal" if temporal else "static",
        "hands": existing["hands"] if existing else 1,
        "hands_confirmed": False,
        "meaning": f"English letter {label} in fingerspelling",
        "source": "ISLRTC-ALPHABET" if label in PILOT else "USER-CHART",
        "verification_status": "unverified",
        "training_status": "excluded_temporal" if temporal else "blocked_unverified",
        "verified": False,
        "reference": (
            f"ISLRTC-ALPHABET, chart cell {label} (not yet checked by a qualified reviewer)"
            if label in PILOT
            else f"USER-CHART, cell {label} (provisional, unconfirmed source)"
        ),
        "reviewed_by": None,
        "reviewed_on": None,
        "signer_confirmed": False,
    }
    if label in PILOT and existing:
        entry["meaning"] = existing["meaning"]
        entry["notes"] = (
            "Earlier AI reading of the ISLRTC chart. It is not a qualified review and is no longer marked verified."
        )
    if temporal:
        entry["notes"] = "Moving sign. Excluded from the initial static classifier. Needs a temporal model later."
    return entry


def main() -> None:
    data = json.loads(VOCABULARY.read_text(encoding="utf-8"))
    existing = {item["label"]: item for item in data.get("classes", [])}

    data["schema_version"] = 3
    data["status"] = "candidate_unverified"
    data["note"] = (
        "Candidate classes only. Every class is unverified. Recording and training refuse any class with "
        "verified set to false. The official ISLRTC English Alphabet chart is the source of truth. The "
        "owner-supplied chart is a provisional visual reference. A qualified ISL signer must confirm each "
        "handshape before a class can be verified."
    )
    data["consent"] = {
        "status": "not_recorded",
        "note": "No participant has consented to recording. The consent form is a draft.",
    }
    if not any(source["id"] == PROVISIONAL_SOURCE["id"] for source in data["sources"]):
        data["sources"].append(PROVISIONAL_SOURCE)

    data["classes"] = [class_entry(letter, existing.get(letter)) for letter in string.ascii_uppercase]
    VOCABULARY.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    verified = sum(1 for item in data["classes"] if item["verified"])
    print(f"Wrote {VOCABULARY}: {len(data['classes'])} classes, {verified} verified")


if __name__ == "__main__":
    main()
