"""Builds the learning catalog from the owner-supplied image folders and the phrase archive.

- Adds each letter's reference folders, and the ten number classes, to dataset/metadata/vocabulary.json.
- Writes dataset/metadata/phrase_vocabulary.json with the 44 daily phrases.

Nothing here approves a mapping. Every entry keeps verified false and signer_confirmed false. The phrase
recognition status comes from the phrase model. It says what the camera model covers, and it is not an approval.

Usage (repository root):  backend\\.venv\\Scripts\\python.exe ai-engine\\collection\\build_learning_catalog.py
"""

import json
import sys
import zipfile
from pathlib import Path

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = AI_ENGINE_DIR.parent
BACKEND_DIR = REPO_DIR / "backend"
VOCABULARY = AI_ENGINE_DIR / "dataset" / "metadata" / "vocabulary.json"
PHRASE_VOCABULARY = AI_ENGINE_DIR / "dataset" / "metadata" / "phrase_vocabulary.json"
STATIC_ROOT = REPO_DIR / "Static gestures of Indian Sign Language (ISL) for English Alphabet, Hindi Vowels and Numerals"
PHRASE_ARCHIVE_REL = "Dataset for everyday phrases and words in Indian sign language/images for phrases.zip"
PHRASE_ARCHIVE = REPO_DIR / PHRASE_ARCHIVE_REL
PHRASE_FOLDER_PREFIX = "images for phrases/"
PHRASE_MODEL_REL = "ai-engine/models/phrase_classifier.joblib"

STATIC_SOURCE_ID = "OWNER-STATIC-SET"
PHRASE_SOURCE_ID = "OWNER-PHRASE-ARCHIVE"
DIGITS = "0123456789"

# Six owner-supplied image sets: audience x sleeve type. Each folder holds one label's still images.
IMAGE_SETS = [
    "1. Kids ISL images/Kids ISL images in Full Sleeves",
    "1. Kids ISL images/Kids ISL images in Half Sleeves",
    "2. Teenagers ISL Images/Teenagers ISL images in Full Sleeves",
    "2. Teenagers ISL Images/Teenagers ISL images in Half Sleeves",
    "3. Adults ISL Images/Adults ISL images in Full Sleeves",
    "3. Adults ISL Images/Adults ISL images in Half Sleeves",
]
# Some labels have two folders in the source sets. Both are kept as reference folders for training.
LETTER_FOLDERS = {"E": ["E1", "E2"]}
NUMBER_FOLDERS = {"9": ["9a", "9b"]}


def image_folders(group: str, folder_names: dict[str, list[str]], label: str) -> list[str]:
    names = folder_names.get(label, [label])
    return [f"ISL Images/{image_set}/{group}/{name}" for image_set in IMAGE_SETS for name in names]


def require_folders(paths: list[str]) -> None:
    missing = [path for path in paths if not (STATIC_ROOT / path).is_dir()]
    if missing:
        raise SystemExit(f"Missing reference folders ({len(missing)}), first: {missing[0]}")


def number_class(label: str) -> dict:
    names = NUMBER_FOLDERS.get(label, [label])
    return {
        "label": label,
        "class_id": f"NUM-{label}",
        "category": "numbers",
        "type": "static",
        "recognition_type": "static",
        "hands": None,
        "hands_confirmed": False,
        "meaning": f"ISL number {label}",
        "source": STATIC_SOURCE_ID,
        "verification_status": "unverified",
        "training_status": "blocked_unverified",
        "verified": False,
        "reference": f"{STATIC_SOURCE_ID}, Numerals/{', '.join(names)} (not yet reviewed)",
        "reference_folders": image_folders("Numerals", NUMBER_FOLDERS, label),
        "reviewed_by": None,
        "reviewed_on": None,
        "signer_confirmed": False,
    }


def build_vocabulary() -> dict:
    data = json.loads(VOCABULARY.read_text(encoding="utf-8"))
    letters = [entry for entry in data["classes"] if entry["label"].isalpha()]
    for entry in letters:
        entry["category"] = "alphabet"
        entry["reference_folders"] = image_folders("English Alphabet", LETTER_FOLDERS, entry["label"])
        require_folders(entry["reference_folders"])
    numbers = [number_class(label) for label in DIGITS]
    for number in numbers:
        require_folders(number["reference_folders"])
    data["classes"] = letters + numbers

    if not any(source["id"] == STATIC_SOURCE_ID for source in data["sources"]):
        data["sources"].append(
            {
                "id": STATIC_SOURCE_ID,
                "name": "Static gestures of Indian Sign Language (ISL) for English Alphabet, Hindi Vowels and Numerals (owner-supplied image sets)",
                "url": None,
                "checked": "Folder structure inspected 2026-11-15. Individual images were not reviewed.",
                "notes": "Six image sets: Kids, Teenagers and Adults, each with full and half sleeves. Used as reference images for training. A mapping is not approved until the project owner reviews it.",
            }
        )
    schema = data["class_schema"]
    schema["category"] = "alphabet or numbers. Decides which Learn Signs section shows the class."
    schema["reference_folders"] = "Folders relative to the static gestures folder, one per image set and variant."
    return data


def phrase_model_status() -> tuple[set[str], dict[str, str]]:
    sys.path.insert(0, str(BACKEND_DIR))
    from app.core.config import get_settings
    from app.services.phrase_recognizer import PhraseRecognizer

    settings = get_settings()
    recognizer = PhraseRecognizer(settings.phrase_model_path, settings.phrase_threshold)
    if not recognizer.available:
        raise SystemExit(f"Phrase model is not available: {recognizer.error}")
    return set(recognizer.labels), dict(recognizer.excluded_phrases)


def archive_phrase_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    with zipfile.ZipFile(PHRASE_ARCHIVE) as archive:
        for info in archive.infolist():
            parts = info.filename.split("/")
            if len(parts) == 3 and parts[0] == "images for phrases" and parts[2].lower().endswith((".jpg", ".jpeg", ".png")):
                counts[parts[1]] = counts.get(parts[1], 0) + 1
    return counts


def phrase_entry(name: str, count: int, in_model: set[str], excluded: dict[str, str]) -> dict:
    if name in in_model:
        status, model_label = "in_model", name
    elif name in excluded:
        status, model_label = f"excluded_{excluded[name].lower()}", None
    else:
        raise SystemExit(f"Phrase '{name}' is neither in the phrase model nor excluded from it")
    slug = name.replace(" ", "-")
    return {
        "id": f"phrase:{slug}",
        "label": name,
        "display_name": name[:1].upper() + name[1:],
        "category": "daily_phrase",
        "reference_archive": PHRASE_ARCHIVE_REL,
        "reference_folder": PHRASE_FOLDER_PREFIX + name,
        "reference_image_count": count,
        "reference_type": "still_images_multiple_angles",
        "asset_name": slug,
        "recognition_status": status,
        "recognition_model_label": model_label,
        "verified": False,
        "reviewed_by": None,
        "reviewed_on": None,
        "signer_confirmed": False,
    }


def build_phrase_vocabulary() -> dict:
    counts = archive_phrase_counts()
    in_model, excluded = phrase_model_status()
    if len(counts) != 44:
        raise SystemExit(f"Expected 44 phrase folders in the archive, found {len(counts)}")
    phrases = [phrase_entry(name, counts[name], in_model, excluded) for name in sorted(counts)]
    image_counts = sorted(set(counts.values()))
    return {
        "schema_version": 1,
        "status": "candidate_unverified",
        "note": (
            "Daily conversation phrases. Every phrase is unverified. recognition_status says whether the camera "
            "phrase model covers the phrase. It does not approve a mapping, and a phrase is not training_ready until "
            "its mapping is verified."
        ),
        "recognition_model": {
            "file": PHRASE_MODEL_REL,
            "checked": "2026-11-15",
            "labels": len(in_model),
            "excluded": len(excluded),
        },
        "sources": [
            {
                "id": PHRASE_SOURCE_ID,
                "name": "Dataset for everyday phrases and words in Indian sign language (images for phrases.zip)",
                "url": None,
                "checked": f"Archive listed 2026-11-15: {len(counts)} phrase folders, {image_counts[0]} to {image_counts[-1]} still images each. The archive has no licence file.",
                "notes": "Each image is a still showing the sign from a different angle, not a frame sequence. Signers are not identified. Licence and citation are unverified.",
            }
        ],
        "phrases": phrases,
    }


def main() -> None:
    vocabulary = build_vocabulary()
    VOCABULARY.write_text(json.dumps(vocabulary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    phrases = build_phrase_vocabulary()
    PHRASE_VOCABULARY.write_text(json.dumps(phrases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    letters = sum(1 for entry in vocabulary["classes"] if entry["category"] == "alphabet")
    numbers = sum(1 for entry in vocabulary["classes"] if entry["category"] == "numbers")
    print(f"Wrote {VOCABULARY}: {letters} letters, {numbers} numbers")
    print(f"Wrote {PHRASE_VOCABULARY}: {len(phrases['phrases'])} phrases")


if __name__ == "__main__":
    main()
