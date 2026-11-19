"""Stage 3 research tests: metadata schema and validator, catalogue, anomaly report coverage, diagnostics and protection.

No real recording is created or validated here. Fixtures are synthetic and clearly labelled."""

import copy
import csv
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

AI_ENGINE = Path(__file__).resolve().parents[1]
REPO = AI_ENGINE.parent
STAGE3 = AI_ENGINE / "training" / "phrase_experiments" / "stage3"
sys.path.insert(0, str(STAGE3))
sys.path.insert(0, str(AI_ENGINE / "training" / "phrase_experiments" / "dynamic"))

import anomaly_report as anomaly  # noqa: E402
import frame_diagnostics as diag  # noqa: E402
import metadata_validator as mv  # noqa: E402
import motion_separation as motion  # noqa: E402

CATALOG = mv.load_catalog(STAGE3 / "phrase_catalog.json")
SCHEMA = json.loads((STAGE3 / "recording_metadata_schema.json").read_text(encoding="utf-8"))


def fixture_record(**overrides) -> dict:
    record = {
        "dataset_version": "isl_dynamic_recordings_v1",
        "recording_id": "REC-0001",
        "phrase_id": "DYN-01",
        "phrase_label": CATALOG["DYN-01"],
        "signer_id": "S01",
        "session_id": "SES-001",
        "capture_date": "2026-11-20",
        "original_fps": 30.0,
        "fps_status": "measured",
        "resolution": "640x480",
        "duration_seconds": 4.0,
        "camera_distance_cm": 120,
        "camera_position": "frontal",
        "lighting_conditions": "daylight",
        "hand_configuration": "two_hands",
        "source_file": "synthetic/REC-0001.mp4",
        "original_sha256": "0" * 64,
        "original_preserved": True,
        "consent_status": "granted",
        "dataset_license_status": "internal_research_only",
        "annotations": [{"start_seconds": 0.0, "end_seconds": 3.5, "annotator_id": "ANN-01",
                         "annotation_confidence": "high", "dispute_note": ""}],
        "review_status": "pending",
        "reviewer_id": "none",
    }
    record.update(overrides)
    return record


def test_catalog_has_28_unique_ids_matching_the_manifest_including_open() -> None:
    labels = mv.manifest_dynamic_labels()
    assert len(labels) == 28
    assert "open" in labels
    assert sorted(CATALOG.values()) == labels
    assert len(CATALOG) == 28 and len(set(CATALOG)) == 28


def test_schema_enumerations_match_the_validator() -> None:
    properties = SCHEMA["properties"]
    for field, values in mv.ENUMS.items():
        if field == "annotation_confidence":
            schema_values = properties["annotations"]["items"]["properties"][field]["enum"]
        else:
            schema_values = properties[field]["enum"]
        assert sorted(schema_values) == sorted(values), field


def test_schema_required_fields_match_the_validator() -> None:
    assert sorted(SCHEMA["required"]) == sorted(mv.REQUIRED)


def test_valid_fixture_passes() -> None:
    assert mv.validate_record(fixture_record(), CATALOG) == []


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({"original_fps": 0}, "original_fps"),
        ({"original_fps": "unknown"}, "original_fps"),
        ({"fps_status": "guessed"}, "fps_status"),
        ({"phrase_id": "DYN-99"}, "not in the catalogue"),
        ({"phrase_label": "wrong label"}, "does not match catalogue"),
        ({"recording_id": "REC-1"}, "recording_id"),
        ({"signer_id": "Asha"}, "signer_id"),
        ({"dataset_version": "isl_phrases_v2_stage0"}, "dataset_version"),
        ({"consent_status": "pending"}, "consent_status"),
        ({"review_status": "accepted", "reviewer_id": "none"}, "reviewer"),
        ({"original_sha256": "XYZ"}, "original_sha256"),
        ({"original_preserved": False}, "original_preserved"),
        ({"capture_date": "20-11-2026"}, "capture_date"),
        ({"camera_distance_cm": 5}, "camera_distance_cm"),
        ({"resolution": "wide"}, "resolution"),
    ],
)
def test_invalid_values_are_rejected(change: dict, expected: str) -> None:
    errors = mv.validate_record(fixture_record(**change), CATALOG)
    assert errors and any(expected in e for e in errors), errors


def test_missing_and_extra_fields_are_rejected() -> None:
    record = fixture_record()
    del record["camera_position"]
    assert any("missing field: camera_position" in e for e in mv.validate_record(record, CATALOG))
    extra = fixture_record(unexpected_field=1)
    assert any("unexpected fields" in e for e in mv.validate_record(extra, CATALOG))


@pytest.mark.parametrize(
    ("annotations", "expected"),
    [
        ([{"start_seconds": 2.0, "end_seconds": 1.0, "annotator_id": "ANN-01", "annotation_confidence": "high", "dispute_note": ""}],
         "greater than start"),
        ([{"start_seconds": 0.0, "end_seconds": 5.0, "annotator_id": "ANN-01", "annotation_confidence": "high", "dispute_note": ""}],
         "exceeds duration"),
        ([{"start_seconds": 0.0, "end_seconds": 2.0, "annotator_id": "ANN-01", "annotation_confidence": "high", "dispute_note": ""},
          {"start_seconds": 1.0, "end_seconds": 3.0, "annotator_id": "ANN-01", "annotation_confidence": "high", "dispute_note": ""}],
         "overlaps"),
        ([], "non-empty"),
    ],
)
def test_timestamp_rules(annotations: list, expected: str) -> None:
    errors = mv.validate_record(fixture_record(annotations=annotations), CATALOG)
    assert any(expected in e for e in errors), errors


def test_recording_id_and_source_file_duplicates_are_detected() -> None:
    a = fixture_record()
    b = fixture_record(phrase_id="DYN-02", phrase_label=CATALOG["DYN-02"])
    report = mv.validate_collection([a, b], CATALOG)
    assert any("appears 2 times" in e for v in report.values() for e in v)


def test_file_integrity_detects_missing_and_altered_files(tmp_path: Path) -> None:
    path = tmp_path / "synthetic" / "REC-0001.mp4"
    path.parent.mkdir()
    path.write_bytes(b"synthetic bytes, not a real recording")
    good = hashlib.sha256(path.read_bytes()).hexdigest()
    assert mv.check_file_integrity(fixture_record(original_sha256=good, source_file="synthetic/REC-0001.mp4"), tmp_path) == []
    assert "sha256 mismatch" in mv.check_file_integrity(fixture_record(source_file="synthetic/REC-0001.mp4"), tmp_path)[0]
    assert "missing" in mv.check_file_integrity(fixture_record(source_file="synthetic/none.mp4"), tmp_path)[0]


def test_no_recording_media_or_real_metadata_is_stored_in_stage3() -> None:
    media = [p for p in STAGE3.rglob("*") if p.suffix.lower() in {".mp4", ".mov", ".avi", ".mkv", ".webm"}]
    assert media == []
    assert not any(p.name.startswith("REC-") for p in STAGE3.rglob("*"))


def test_anomaly_report_covers_only_the_dynamic_phrases() -> None:
    labels = set(mv.manifest_dynamic_labels())
    with open(STAGE3 / "anomaly_report.csv", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert rows
    assert {r["phrase"] for r in rows} <= labels


def test_every_flagged_frame_appears_in_the_anomaly_report() -> None:
    with open(STAGE3 / "reports" / "frame_diagnostics.csv", encoding="utf-8", newline="") as handle:
        frames = list(csv.DictReader(handle))
    with open(STAGE3 / "anomaly_report.csv", encoding="utf-8", newline="") as handle:
        report = list(csv.DictReader(handle))
    covered = set()
    for r in report:
        lo, _, hi = r["frames"].partition("-")
        hi = hi or lo
        for n in range(int(lo), int(hi) + 1):
            covered.add((r["phrase"], r["slot"], n, r["anomaly"]))
    missing = []
    for f in frames:
        for side in ("left", "right"):
            for flag in filter(None, f[f"{side}_flags"].split(";")):
                if (f["phrase"], side, int(f["frame_number"]), flag) not in covered:
                    missing.append((f["phrase"], side, f["frame_number"], flag))
    assert missing == []


def test_no_anomaly_row_discards_data() -> None:
    with open(STAGE3 / "anomaly_report.csv", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert all(r["data_status"] == "retained; not discarded" for r in rows)
    assert all(r["cause_label"] in {"CONFIRMED_DETECTOR_FAILURE", "POSSIBLE_DETECTOR_FAILURE",
                                    "POSSIBLE_GENUINE_VARIATION", "CAMERA_FRAMING", "UNCERTAIN"} for r in rows)


def test_visual_checks_are_recorded_with_their_findings() -> None:
    with open(STAGE3 / "anomaly_report.csv", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    checked = [r for r in rows if r["visual_check"] == "yes"]
    assert checked
    assert all(r["evidence"] and not r["evidence"].startswith("rule:") for r in checked)


def test_abs_step_threshold_is_consistent_between_scripts() -> None:
    assert diag.ABS_STEP_LIMIT == anomaly.ABS_STEP_LIMIT == 0.25


def synthetic_landmarks(rows: int) -> np.ndarray:
    landmarks = np.full((rows, 2, 21, 3), np.nan, dtype=np.float32)
    base = np.zeros((21, 3), dtype=np.float32)
    base[:, 0] = np.linspace(0.4, 0.6, 21)
    base[:, 1] = np.linspace(0.4, 0.6, 21)
    base[9] = base[0] + np.array([0.0, 0.12, 0.0], dtype=np.float32)
    landmarks[:, 0] = base
    return landmarks


def test_diagnostics_flag_collapsed_size_and_large_absolute_steps() -> None:
    landmarks = synthetic_landmarks(3)
    landmarks[1, 0, 9] = landmarks[1, 0, 0] + np.array([0.0, 0.003, 0.0], dtype=np.float32)
    landmarks[2, 0] = landmarks[2, 0] + np.float32(0.4)
    rows = [{"phrase_label": "x", "frame_number": str(n), "source_file": f"{n}.png", "landmarks_row": str(n - 1),
             "training_eligibility": "dynamic_sequence_member", "gesture_category": "dynamic"} for n in (1, 2, 3)]
    frames = diag.diagnose("x", rows, landmarks)
    assert "size_low" in frames[1]["left_flags"]
    assert "abs_jump" in frames[2]["left_flags"]


def test_diagnostics_handle_missing_hands_without_crashing() -> None:
    landmarks = synthetic_landmarks(2)
    landmarks[:, 1] = np.nan
    landmarks[1, 0] = np.nan
    rows = [{"phrase_label": "x", "frame_number": str(n), "source_file": f"{n}.png", "landmarks_row": str(n - 1),
             "training_eligibility": "dynamic_sequence_member", "gesture_category": "dynamic"} for n in (1, 2)]
    frames = diag.diagnose("x", rows, landmarks)
    assert frames[0]["left_present"] is True and frames[1]["left_present"] is False
    assert frames[1]["presence_transition"] == "left_disappears"


def test_auc_is_one_for_perfect_separation_and_half_for_identical_groups() -> None:
    assert motion.auc(np.array([3.0, 4.0]), np.array([1.0, 2.0])) == 1.0
    assert motion.auc(np.array([1.0, 2.0]), np.array([1.0, 2.0])) == pytest.approx(0.5)


def test_stage2_and_stage1_candidates_are_unchanged() -> None:
    static_report = json.loads((REPO / "ai-engine" / "models" / "phrase_candidates" / "static_v1" / "training_report.json")
                               .read_text(encoding="utf-8"))
    recorded = static_report["config"]["artifacts"]["full"]["sha256"]
    actual = hashlib.sha256((REPO / "ai-engine" / "models" / "phrase_candidates" / "static_v1" / "candidate_full.joblib")
                            .read_bytes()).hexdigest()
    assert recorded == actual
    dtw = json.loads((REPO / "ai-engine" / "models" / "phrase_candidates" / "dynamic_v1" / "dtw_config.json")
                     .read_text(encoding="utf-8"))
    assert dtw["status"] == "not_activated"


def test_protected_locations_still_exist_unchanged() -> None:
    assert not (REPO / "signbridge_training" / "model").exists()
    active = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
    assert hashlib.sha256(active.read_bytes()).hexdigest() == \
        "ecb20d58dec82ee2c994f2b65def4e202a08fa8f150baa06bcc80331e39842aa"


def test_original_dynamic_images_still_match_the_manifest_sample() -> None:
    source = REPO / "Dataset for everyday phrases and words in Indian sign language" / "images for phrases"
    if not source.is_dir():
        pytest.skip("original dataset folder not present")
    with open(REPO / "ai-engine" / "dataset" / "public" / "isl_phrases" / "v2" / "phrase_manifest.csv",
              encoding="utf-8", newline="") as handle:
        rows = [r for r in csv.DictReader(handle) if r["gesture_category"] == "dynamic"]
    for r in rows[::56]:
        assert hashlib.sha256((source / r["phrase_label"] / r["source_file"]).read_bytes()).hexdigest() == r["sha256"]
