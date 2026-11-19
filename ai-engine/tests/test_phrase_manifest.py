"""Stage 0 phrase manifest: pure-logic tests, a source read-only check, and checks of the generated manifest."""

import csv
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

AI_ENGINE = Path(__file__).resolve().parents[1]
REPO = AI_ENGINE.parent
sys.path.insert(0, str(AI_ENGINE / "training" / "phrase_experiments"))

import build_manifest as bm  # noqa: E402

MANIFEST = AI_ENGINE / "dataset" / "public" / "isl_phrases" / "v2" / "phrase_manifest.csv"
SUMMARY = AI_ENGINE / "dataset" / "public" / "isl_phrases" / "v2" / "dataset_summary.json"
SOURCE = REPO / "Dataset for everyday phrases and words in Indian sign language" / "images for phrases"
ALLOWED_ELIGIBILITY = {
    "static_train_candidate", "static_excluded_near_duplicate", "static_excluded_no_hand",
    "static_held", "dynamic_sequence_member", "excluded_undetermined",
}


def test_connected_components_links_transitively() -> None:
    labels = bm.connected_components(5, [(0, 1), (1, 2)])
    assert labels[0] == labels[1] == labels[2]
    assert len({labels[3], labels[4], labels[0]}) == 3


def test_connected_components_labels_are_dense_and_deterministic() -> None:
    first = bm.connected_components(4, [(2, 3)])
    second = bm.connected_components(4, [(2, 3)])
    assert first == second == [0, 1, 2, 2]


def test_near_pairs_finds_identical_frames_and_not_different_ones() -> None:
    rng = np.random.default_rng(0)
    base = rng.uniform(0, 255, size=(1, 3072))
    different = rng.uniform(0, 255, size=(1, 3072))
    grey = np.vstack([base, base + 0.5, different])
    pairs = bm.near_pairs(grey, bm.NEAR_DUP_MEAN_DIFF)
    assert (0, 1) in pairs
    assert all(2 not in pair for pair in pairs)


def test_static_training_keeps_only_representative_frames_with_hands() -> None:
    assert bm.eligibility("static_train", True, True)[0] == "static_train_candidate"
    assert bm.eligibility("static_train", True, False)[0] == "static_excluded_near_duplicate"
    assert bm.eligibility("static_train", False, True)[0] == "static_excluded_no_hand"


def test_held_undetermined_and_dynamic_are_never_static_candidates() -> None:
    assert bm.eligibility("static_hold", True, True)[0] == "static_held"
    assert bm.eligibility("undetermined", True, True)[0] == "excluded_undetermined"
    assert bm.eligibility("dynamic", True, True)[0] == "dynamic_sequence_member"


def test_gesture_class_mapping_follows_the_approved_lists() -> None:
    assert bm.gesture_class_of("change", "STATIC") == "static_train"
    assert bm.gesture_class_of("sick", "STATIC") == "static_hold"
    assert bm.gesture_class_of("again", "DYNAMIC") == "dynamic"
    assert bm.gesture_class_of("careful", "UNDETERMINED") == "undetermined"


@pytest.mark.parametrize(
    ("unique", "hands", "tier"),
    [(30, 35, "Good"), (29, 35, "Limited"), (30, 34, "Limited"), (14, 40, "Poor"), (40, 19, "Poor")],
)
def test_quality_tier_boundaries(unique: int, hands: int, tier: str) -> None:
    assert bm.quality_tier(unique, hands) == tier


def test_scan_source_reads_without_writing(tmp_path: Path) -> None:
    source = tmp_path / "images for phrases"
    for phrase in ("alpha", "beta"):
        (source / phrase).mkdir(parents=True)
        for frame in (1, 2):
            from PIL import Image

            Image.new("RGB", (8, 6), (frame * 40, 0, 0)).save(source / phrase / f"{frame}.png")
    (source / "stray.txt").write_text("not an image")
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob("*") if p.is_file()}

    records, issues = bm.scan_source(source)

    assert {r["phrase"] for r in records} == {"alpha", "beta"}
    assert len(records) == 4
    assert any("stray.txt" in issue for issue in issues)
    after = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob("*") if p.is_file()}
    assert before == after


def test_connected_components_on_real_style_thumbnails_is_not_all_one_group() -> None:
    rng = np.random.default_rng(1)
    grey = rng.uniform(0, 255, size=(6, 3072))
    labels = bm.connected_components(6, bm.near_pairs(grey, bm.NEAR_DUP_MEAN_DIFF))
    assert len(set(labels)) == 6


manifest_present = pytest.mark.skipif(not MANIFEST.is_file(), reason="Stage 0 manifest has not been generated")


@pytest.fixture(scope="module")
def rows() -> list[dict]:
    with open(MANIFEST, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


@manifest_present
def test_manifest_has_every_image_once(rows: list[dict]) -> None:
    assert len(rows) == 1760
    keys = {(r["phrase_label"], r["source_file"]) for r in rows}
    assert len(keys) == 1760
    phrases = {r["phrase_label"] for r in rows}
    assert len(phrases) == 44
    for phrase in phrases:
        frames = sorted(int(r["frame_number"]) for r in rows if r["phrase_label"] == phrase)
        assert frames == list(range(1, 41))


@manifest_present
def test_eligibility_values_and_counts(rows: list[dict]) -> None:
    assert {r["training_eligibility"] for r in rows} <= ALLOWED_ELIGIBILITY
    counts = {}
    for r in rows:
        counts[r["training_eligibility"]] = counts.get(r["training_eligibility"], 0) + 1
    assert counts["dynamic_sequence_member"] == 28 * 40
    assert counts["excluded_undetermined"] == 5 * 40
    assert counts["static_held"] == 2 * 40


@manifest_present
def test_static_training_is_limited_to_nine_representative_frames(rows: list[dict]) -> None:
    candidates = [r for r in rows if r["training_eligibility"] == "static_train_candidate"]
    assert {r["phrase_label"] for r in candidates} == set(bm.STATIC_TRAIN)
    assert all(r["is_representative"] == "True" for r in candidates)
    assert all(r["hand_detected"] == "True" for r in candidates)
    groups = {}
    for r in candidates:
        groups.setdefault(r["near_duplicate_group"], 0)
        groups[r["near_duplicate_group"]] += 1
    assert all(count == 1 for count in groups.values())


@manifest_present
def test_no_held_or_dynamic_phrase_enters_static_training(rows: list[dict]) -> None:
    for r in rows:
        if r["training_eligibility"] == "static_train_candidate":
            assert r["phrase_label"] not in bm.STATIC_HELD
            assert r["gesture_category"] == "static"


@manifest_present
def test_frame_order_is_preserved_in_the_manifest(rows: list[dict]) -> None:
    for phrase in {r["phrase_label"] for r in rows}:
        ordered = [int(r["frame_number"]) for r in rows if r["phrase_label"] == phrase]
        assert ordered == sorted(ordered)


@manifest_present
def test_source_frame_rate_is_recorded_as_unknown(rows: list[dict]) -> None:
    assert {r["source_frame_rate"] for r in rows} == {"unknown"}
    assert {r["clip_id_status"] for r in rows} == {"assumed_single_clip_unverified"}


@manifest_present
def test_summary_validations_all_pass() -> None:
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    statuses = [v["status"] for v in summary["validations"]]
    assert statuses and "fail" not in statuses
    assert summary["counts"]["images"] == 1760


@manifest_present
@pytest.mark.skipif(not SOURCE.is_dir(), reason="original dataset folder not present")
def test_sampled_originals_still_match_their_manifest_hashes(rows: list[dict]) -> None:
    for r in rows[::88]:
        path = SOURCE / r["phrase_label"] / r["source_file"]
        assert bm.sha256_file(path) == r["sha256"]
