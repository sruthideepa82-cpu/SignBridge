"""Stage 4 review preparation tests: register completeness, pending decisions, ISL status, checklist vocabulary,
rebuild determinism and protected-artifact integrity. Nothing here records a human decision or verifies an ISL label."""

import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

import pytest

AI_ENGINE = Path(__file__).resolve().parents[1]
REPO = AI_ENGINE.parent
STAGE3 = AI_ENGINE / "training" / "phrase_experiments" / "stage3"
STAGE4 = AI_ENGINE / "training" / "phrase_experiments" / "stage4"
sys.path.insert(0, str(STAGE4))
sys.path.insert(0, str(STAGE3))

import build_review_artifacts as b4  # noqa: E402
from anomaly_report import VISUAL_CHECKS  # noqa: E402

MANIFEST = AI_ENGINE / "dataset" / "public" / "isl_phrases" / "v2" / "phrase_manifest.csv"
ORIGINALS = REPO / "Dataset for everyday phrases and words in Indian sign language" / "images for phrases"
REGISTER = STAGE4 / "human_review_register.csv"
ISL = STAGE4 / "isl_verification_register.csv"
QUALITY = STAGE4 / "dataset_quality_report.md"
CHECKLIST = STAGE4 / "stage4_checklist.md"


def read(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def dynamic_labels() -> set[str]:
    return {r["phrase_label"] for r in read(MANIFEST) if r["gesture_category"] == "dynamic"}


def flagged_samples_from_diagnostics() -> set[tuple[str, str, str, str]]:
    samples = set()
    for frame in read(STAGE3 / "reports" / "frame_diagnostics.csv"):
        for slot in ("left", "right"):
            for flag in (frame[f"{slot}_flags"] or "").split(";"):
                if flag:
                    samples.add((frame["phrase"], frame["frame_number"], slot, flag))
    return samples


def test_register_has_one_row_per_flagged_sample() -> None:
    rows = read(REGISTER)
    keys = [(r["phrase_label"], r["frame_number"], r["slot_reported"], r["anomaly_flag"]) for r in rows]
    assert len(keys) == len(set(keys)), "duplicate samples in the register"
    assert set(keys) == flagged_samples_from_diagnostics()


def test_register_ids_are_unique_and_sequential() -> None:
    ids = [r["review_id"] for r in read(REGISTER)]
    assert len(ids) == len(set(ids))
    assert ids == [f"HR-{i:04d}" for i in range(1, len(ids) + 1)]


def test_decision_fields_are_empty_and_reviewers_pending() -> None:
    for r in read(REGISTER):
        for field in ("reviewer_1_decision", "reviewer_2_decision", "reconciled_decision"):
            assert r[field] == "", f"{r['review_id']} has a recorded decision"
        assert r["reviewer_1_id"] == "REV-PENDING" and r["reviewer_2_id"] == "REV-PENDING"


def test_review_status_vocabulary() -> None:
    allowed = {"pending_independent_review", "stage3_visual_check_pending_human_review"}
    assert {r["review_status"] for r in read(REGISTER)} <= allowed


def test_visual_check_rows_match_the_stage3_list_exactly() -> None:
    visual = [r for r in read(REGISTER) if r["stage3_visual_check"] == "yes"]
    assert len(visual) == 11
    expected = set()
    for check in VISUAL_CHECKS:
        for frame in check["frames"]:
            for flag in ("size_low", "jump", "abs_jump"):
                if (check["phrase"], str(frame), check["slot"], flag) in flagged_samples_from_diagnostics():
                    expected.add((check["phrase"], str(frame), check["slot"], flag))
    actual = {(r["phrase_label"], r["frame_number"], r["slot_reported"], r["anomaly_flag"]) for r in visual}
    assert actual == expected


def test_confirmed_label_only_on_visually_checked_samples() -> None:
    for r in read(REGISTER):
        if r["stage3_primary_cause"] == "CONFIRMED_DETECTOR_FAILURE":
            assert r["stage3_visual_check"] == "yes", r["review_id"]


def test_no_sample_is_marked_for_deletion_or_modification() -> None:
    assert {r["data_action"] for r in read(REGISTER)} == {"none: sample retained unchanged"}


def test_phrase_labels_and_ids_match_the_manifest_and_catalogue() -> None:
    labels = dynamic_labels()
    catalog = {p["phrase_label"]: p["phrase_id"]
               for p in json.loads((STAGE3 / "phrase_catalog.json").read_text(encoding="utf-8"))["phrases"]}
    for r in read(REGISTER):
        assert r["phrase_label"] in labels
        assert catalog[r["phrase_label"]] == r["phrase_id"]


def test_isl_register_has_28_pending_rows_and_no_meanings() -> None:
    rows = read(ISL)
    assert len(rows) == 28
    assert {r["isl_verification_status"] for r in rows} == {"pending"}
    assert {r["final_approval_status"] for r in rows} == {"not approved"}
    assert {r["intended_meaning_isl_expert"] for r in rows} == {""}
    assert {r["reviewer_identity"] for r in rows} == {"REV-PENDING"}
    assert {r["phrase_name"] for r in rows} == dynamic_labels()


def test_isl_register_never_says_verified() -> None:
    for r in read(ISL):
        for value in r.values():
            assert not re.search(r"\bverified\b(?!\s*:)", value, re.IGNORECASE) or "unverified" in value.lower() or \
                "not verified" in value.lower(), value


def test_quality_report_counts_agree_with_the_register() -> None:
    register = read(REGISTER)
    text = QUALITY.read_text(encoding="utf-8")
    counts = Counter(r["review_category"] for r in register)
    for category, count in counts.items():
        assert re.search(rf"\| {re.escape(category)} \| {count} \|", text), category
    assert "Samples with independent human review: **0**" in text


def test_checklist_uses_only_the_three_status_words() -> None:
    rows = [line for line in CHECKLIST.read_text(encoding="utf-8").splitlines() if line.startswith("| S4-")]
    assert rows, "no checklist rows"
    statuses = {cells[2] for cells in (line.split("|")[1:-1] for line in rows)}
    statuses = {s.strip() for s in statuses}
    assert statuses <= {"completed", "pending", "blocked"}, statuses


def test_rebuild_is_deterministic() -> None:
    anomalies = read(STAGE3 / "anomaly_report.csv")
    frames = read(STAGE3 / "reports" / "frame_diagnostics.csv")
    rebuilt = [{k: str(v) for k, v in row.items()} for row in b4.build_review_register(anomalies, frames)]
    assert rebuilt == read(REGISTER)


def test_stage3_inputs_are_unchanged_in_shape() -> None:
    assert len(read(STAGE3 / "anomaly_report.csv")) == 68
    assert len(read(STAGE3 / "reports" / "frame_diagnostics.csv")) == 1120
    assert len(read(MANIFEST)) == 1760


def test_no_recording_or_media_created_in_stage4() -> None:
    assert not [p for p in STAGE4.rglob("*") if p.suffix.lower() in {".mp4", ".mov", ".avi", ".mkv", ".webm", ".png", ".jpg"}]


def test_original_images_still_match_the_manifest_sample() -> None:
    if not ORIGINALS.is_dir():
        pytest.skip("original dataset folder not present")
    rows = [r for r in read(MANIFEST) if r["gesture_category"] == "dynamic"]
    for r in rows[::112]:
        path = ORIGINALS / r["phrase_label"] / r["source_file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == r["sha256"]
    assert len([p for p in ORIGINALS.rglob("*") if p.is_file()]) == 1760


def test_protected_artifacts_unchanged() -> None:
    assert not (REPO / "signbridge_training" / "model").exists()
    active = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
    assert hashlib.sha256(active.read_bytes()).hexdigest() == \
        "ecb20d58dec82ee2c994f2b65def4e202a08fa8f150baa06bcc80331e39842aa"
    static = json.loads((REPO / "ai-engine" / "models" / "phrase_candidates" / "static_v1" / "training_report.json")
                        .read_text(encoding="utf-8"))
    actual = hashlib.sha256((REPO / "ai-engine" / "models" / "phrase_candidates" / "static_v1" / "candidate_full.joblib")
                            .read_bytes()).hexdigest()
    assert static["config"]["artifacts"]["full"]["sha256"] == actual
    dtw = json.loads((REPO / "ai-engine" / "models" / "phrase_candidates" / "dynamic_v1" / "dtw_config.json")
                     .read_text(encoding="utf-8"))
    assert dtw["status"] == "not_activated"
