import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "public_datasets" / "isl_static"))

from inspect_isl_static import (  # noqa: E402
    categorise,
    decode_image,
    dhash,
    ensure_outside,
    hamming,
    label_for,
    near_duplicate_pairs,
    scan_rows,
    similar_pair_histogram,
)

REPO = Path(__file__).resolve().parents[2]
FIXTURE = REPO / "backend" / "tests" / "fixtures" / "hand_thumb_up.jpg"
MODEL = REPO / "backend" / "models" / "hand_landmarker.task"


def test_categories_follow_the_folder_names():
    assert categorise("English Alphabet") == "alphabet"
    assert categorise("Hindi Vowels") == "hindi_vowel"
    assert categorise("Numerals") == "numeral"


def test_variant_signs_map_to_one_label():
    assert label_for("alphabet", "E1") == ("E", "1")
    assert label_for("alphabet", "E2") == ("E", "2")
    assert label_for("alphabet", "A") == ("A", "")
    assert label_for("numeral", "9a") == ("9", "a")
    assert label_for("numeral", "0") == ("0", "")


def test_hindi_labels_are_kept_as_their_folder_name():
    assert label_for("hindi_vowel", "अ") == ("अ", "")


def test_scan_flags_files_outside_the_expected_depth(tmp_path):
    good = tmp_path / "1. Kids ISL images" / "Kids ISL images in Full Sleeves" / "English Alphabet" / "A"
    good.mkdir(parents=True)
    Image.new("RGB", (40, 40)).save(good / "A (1).jpg")
    stray = tmp_path / "notes"
    stray.mkdir()
    Image.new("RGB", (40, 40)).save(stray / "stray.jpg")

    rows = {row["filename"]: row for row in scan_rows(tmp_path)}

    assert rows["A (1).jpg"]["label"] == "A"
    assert rows["A (1).jpg"]["sleeve"] == "Full Sleeves"
    assert rows["A (1).jpg"]["is_image"] is True
    assert rows["stray.jpg"]["category"] == "unexpected"


def test_identical_images_have_identical_hashes_and_brightness_changes_stay_close():
    base = np.tile(np.arange(64, dtype=np.uint8), (64, 1))
    first = Image.fromarray(base).convert("L")
    brighter = Image.fromarray(np.clip(base.astype(int) + 12, 0, 255).astype(np.uint8)).convert("L")
    assert dhash(first) == dhash(first)
    assert hamming(dhash(first), dhash(brighter)) <= 3


def test_near_duplicate_search_finds_close_pairs_and_ignores_distant_ones():
    hashes = {1: 0b1010, 2: 0b1011, 3: 0xFFFFFFFFFFFFFFFF}

    pairs = near_duplicate_pairs(hashes)

    assert (1, 2, 1) in pairs
    assert all(3 not in (a, b) for a, b, _ in pairs)


def test_near_duplicate_search_matches_a_brute_force_comparison():
    rng = np.random.default_rng(0)
    base = rng.integers(0, 2**63, size=120, dtype=np.uint64)
    values = list(base) + [int(v) ^ (1 << int(bit)) for v, bit in zip(base[:30], rng.integers(0, 64, size=30))]
    values += [int(values[0])] * 3  # identical hashes on different images
    hashes = {index: int(value) for index, value in enumerate(values)}

    found = {(a, b): d for a, b, d in near_duplicate_pairs(hashes)}
    expected = {}
    ids = list(hashes)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            distance = hamming(hashes[a], hashes[b])
            if distance <= 3:
                expected[(a, b)] = distance

    assert found == expected


def test_pair_histogram_matches_a_brute_force_count():
    rng = np.random.default_rng(1)
    base = rng.integers(0, 2**63, size=60, dtype=np.uint64)
    values = list(base) + [int(v) ^ (1 << int(bit)) for v, bit in zip(base[:20], rng.integers(0, 64, size=20))]
    values += [int(values[3])] * 4
    hashes = {index: int(value) for index, value in enumerate(values)}

    expected = {d: 0 for d in range(4)}
    ids = list(hashes)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            distance = hamming(hashes[a], hashes[b])
            if distance <= 3:
                expected[distance] += 1

    assert similar_pair_histogram(hashes, 3) == expected


def test_output_inside_the_dataset_is_refused(tmp_path):
    with pytest.raises(SystemExit):
        ensure_outside(tmp_path, tmp_path / "out")


def test_output_outside_the_dataset_is_allowed(tmp_path):
    ensure_outside(tmp_path / "dataset", tmp_path / "reports")


def test_corrupt_images_are_recorded_as_unreadable_not_raised(tmp_path):
    bad = tmp_path / "broken.jpg"
    bad.write_bytes(b"this is not an image")

    result = decode_image(str(bad))

    assert result["readable"] is False
    assert result["error"]


def test_a_real_image_is_decoded_with_size_and_hashes():
    result = decode_image(str(FIXTURE))

    assert result["readable"] is True
    assert int(result["width"]) > 0 and int(result["height"]) > 0
    assert len(result["sha256"]) == 64


@pytest.mark.skipif(not MODEL.exists(), reason="hand_landmarker.task not available")
def test_landmark_extraction_returns_a_63_value_feature_for_a_detected_hand():
    from inspect_isl_static import _init_landmarker, detect_landmarks

    _init_landmarker(str(MODEL))
    result = detect_landmarks((0, str(FIXTURE)))

    assert result["detected"] is True
    assert result["feature_ok"] is True
    assert result["feature"].shape == (63,)
    assert np.isfinite(result["feature"]).all()
