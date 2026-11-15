import json
import string
import sys
import zipfile
from pathlib import Path

import pytest

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = AI_ENGINE_DIR.parent
METADATA_DIR = AI_ENGINE_DIR / "dataset" / "metadata"
STATIC_ROOT = REPO_DIR / "Static gestures of Indian Sign Language (ISL) for English Alphabet, Hindi Vowels and Numerals"
PHRASE_ARCHIVE = REPO_DIR / "Dataset for everyday phrases and words in Indian sign language" / "images for phrases.zip"
sys.path.insert(0, str(AI_ENGINE_DIR / "collection"))

from export_vocabulary_for_frontend import asset_available, training_ready  # noqa: E402


def load(name: str) -> dict:
    return json.loads((METADATA_DIR / name).read_text(encoding="utf-8"))


def static_classes() -> list[dict]:
    return load("vocabulary.json")["classes"]


def phrases() -> list[dict]:
    return load("phrase_vocabulary.json")["phrases"]


def test_letters_and_numbers_are_separate_categories() -> None:
    classes = static_classes()
    letters = [entry["label"] for entry in classes if entry["category"] == "alphabet"]
    numbers = [entry["label"] for entry in classes if entry["category"] == "numbers"]

    assert letters == list(string.ascii_uppercase)
    assert numbers == list(string.digits)


def test_every_static_class_is_unverified_and_unsigned() -> None:
    for entry in static_classes():
        assert entry["verified"] is False, entry["label"]
        assert entry["signer_confirmed"] is False, entry["label"]


def test_temporal_letters_stay_out_of_static_training() -> None:
    classes = {entry["label"]: entry for entry in static_classes()}

    for label in ("J", "Z"):
        assert classes[label]["recognition_type"] == "temporal"
        assert classes[label]["training_status"] == "excluded_temporal"


def test_ambiguous_variants_are_both_mapped_to_their_label() -> None:
    classes = {entry["label"]: entry for entry in static_classes()}

    assert {folder.rsplit("/", 1)[-1] for folder in classes["E"]["reference_folders"]} == {"E1", "E2"}
    assert {folder.rsplit("/", 1)[-1] for folder in classes["9"]["reference_folders"]} == {"9a", "9b"}
    assert len(classes["E"]["reference_folders"]) == 12
    assert len(classes["0"]["reference_folders"]) == 6


def test_every_reference_folder_exists_on_disk() -> None:
    if not STATIC_ROOT.is_dir():
        pytest.skip("Static gestures folder is not in this checkout.")
    missing = [
        folder
        for entry in static_classes()
        for folder in entry["reference_folders"]
        if not (STATIC_ROOT / folder).is_dir()
    ]
    assert missing == []


def test_animation_alone_never_makes_a_class_training_ready(tmp_path: Path) -> None:
    animation = tmp_path / "alphabet"
    animation.mkdir()
    (animation / "B.mp4").write_bytes(b"")
    entry = {"label": "B", "category": "alphabet", "recognition_type": "static", "verified": False,
             "reference_folders": ["x"]}

    assert asset_available(entry, animations=tmp_path) is True
    assert training_ready(entry) is False


def test_training_ready_needs_verification_static_type_and_a_reference() -> None:
    approved = {"verified": True, "recognition_type": "static", "reference_folders": ["x"]}

    assert training_ready(approved) is True
    assert training_ready({**approved, "recognition_type": "temporal"}) is False
    assert training_ready({**approved, "reference_folders": []}) is False


def test_phrase_catalog_has_44_phrases_split_between_model_and_exclusions() -> None:
    catalog = load("phrase_vocabulary.json")
    statuses = [phrase["recognition_status"] for phrase in catalog["phrases"]]

    assert len(statuses) == 44
    assert statuses.count("in_model") == catalog["recognition_model"]["labels"] == 11
    assert len(statuses) - statuses.count("in_model") == catalog["recognition_model"]["excluded"] == 33
    assert all(status in {"in_model", "excluded_dynamic", "excluded_undetermined"} for status in statuses)


def test_phrases_are_unverified_and_not_training_ready() -> None:
    for phrase in phrases():
        assert phrase["verified"] is False, phrase["label"]
        assert phrase["signer_confirmed"] is False, phrase["label"]


def test_every_phrase_points_at_its_archive_folder() -> None:
    if not PHRASE_ARCHIVE.is_file():
        pytest.skip("Phrase archive is not in this checkout.")
    with zipfile.ZipFile(PHRASE_ARCHIVE) as archive:
        names = archive.namelist()
    for phrase in phrases():
        folder = phrase["reference_folder"] + "/"
        images = [name for name in names if name.startswith(folder) and name.lower().endswith((".jpg", ".jpeg", ".png"))]
        assert len(images) == phrase["reference_image_count"] == 40, phrase["label"]
