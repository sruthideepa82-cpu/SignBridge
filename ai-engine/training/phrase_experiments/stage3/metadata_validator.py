"""Stage 3: validator for dynamic-phrase recording metadata. Standard library only (jsonschema is not installed).

It enforces recording_metadata_schema.json. Tests check that the enumerations here match the schema file.

Also builds phrase_catalog.json from the Stage 0 manifest, so phrase IDs follow the authoritative class list.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\stage3\\metadata_validator.py --write-catalog
"""

import argparse
import csv
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = Path(__file__).resolve().parents[4]
MANIFEST = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases" / "v2" / "phrase_manifest.csv"
CATALOG = HERE / "phrase_catalog.json"
SCHEMA = HERE / "recording_metadata_schema.json"

DATASET_VERSION = "isl_dynamic_recordings_v1"
ENUMS = {
    "fps_status": ["measured", "device_reported"],
    "camera_position": ["frontal", "left_side", "right_side", "elevated", "other"],
    "lighting_conditions": ["daylight", "indoor_artificial", "mixed", "low_light", "other"],
    "hand_configuration": ["one_hand_right", "one_hand_left", "two_hands", "alternating", "unknown"],
    "consent_status": ["granted", "pending", "withdrawn", "not_applicable_synthetic"],
    "dataset_license_status": ["unknown", "internal_research_only", "licence_agreed_research", "redistributable"],
    "annotation_confidence": ["high", "medium", "low"],
    "review_status": ["pending", "accepted", "rejected", "needs_review"],
}
REQUIRED = [
    "dataset_version", "recording_id", "phrase_id", "phrase_label", "signer_id", "session_id",
    "capture_date", "original_fps", "fps_status", "resolution", "duration_seconds", "camera_distance_cm",
    "camera_position", "lighting_conditions", "hand_configuration", "source_file", "original_sha256",
    "original_preserved", "consent_status", "dataset_license_status", "annotations", "review_status", "reviewer_id",
]
PATTERNS = {
    "recording_id": r"^REC-[0-9]{4}$",
    "phrase_id": r"^DYN-[0-9]{2}$",
    "signer_id": r"^S[0-9]{2}$",
    "session_id": r"^SES-[0-9]{3}$",
    "resolution": r"^[0-9]{3,4}x[0-9]{3,4}$",
    "original_sha256": r"^[0-9a-f]{64}$",
    "reviewer_id": r"^(REV-[0-9]{2}|none)$",
}
ANNOTATOR_PATTERN = r"^ANN-[0-9]{2}$"


def load_catalog(path: Path = CATALOG) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {entry["phrase_id"]: entry["phrase_label"] for entry in data["phrases"]}


def manifest_dynamic_labels() -> list[str]:
    with open(MANIFEST, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return sorted({r["phrase_label"] for r in rows if r["gesture_category"] == "dynamic"})


def build_catalog() -> dict:
    labels = manifest_dynamic_labels()
    if len(labels) != 28:
        raise SystemExit(f"expected 28 dynamic labels, found {len(labels)}")
    return {
        "dataset_version": DATASET_VERSION,
        "source_manifest": "ai-engine/dataset/public/isl_phrases/v2/phrase_manifest.csv",
        "note": "Labels come from the Stage 0 manifest, which includes 'open'. Labels are unverified until ISL review. "
                "IDs are assigned alphabetically and are stable for this catalogue version only.",
        "phrases": [{"phrase_id": f"DYN-{i:02d}", "phrase_label": label} for i, label in enumerate(labels, start=1)],
    }


def _iso_date(value: str) -> bool:
    try:
        dt.date.fromisoformat(value)
        return True
    except (TypeError, ValueError):
        return False


def validate_record(record: dict, catalog: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED:
        if field not in record:
            errors.append(f"missing field: {field}")
    extra = set(record) - set(REQUIRED)
    if extra:
        errors.append(f"unexpected fields: {sorted(extra)}")
    if errors:
        return errors

    if record["dataset_version"] != DATASET_VERSION:
        errors.append(f"dataset_version must be {DATASET_VERSION}")
    for field, pattern in PATTERNS.items():
        if not isinstance(record[field], str) or not re.match(pattern, record[field]):
            errors.append(f"{field} does not match {pattern}")
    if record["phrase_id"] not in catalog:
        errors.append(f"phrase_id {record['phrase_id']} is not in the catalogue")
    elif record["phrase_label"] != catalog[record["phrase_id"]]:
        errors.append(f"phrase_label '{record['phrase_label']}' does not match catalogue label for {record['phrase_id']}")
    if not _iso_date(record["capture_date"]):
        errors.append("capture_date must be an ISO date")
    fps = record["original_fps"]
    if isinstance(fps, bool) or not isinstance(fps, (int, float)) or not (0 < fps <= 240):
        errors.append("original_fps must be a positive number no greater than 240 (unknown is not allowed)")
    if record["fps_status"] not in ENUMS["fps_status"]:
        errors.append("fps_status must be measured or device_reported")
    duration = record["duration_seconds"]
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or duration <= 0:
        errors.append("duration_seconds must be positive")
        duration = None
    distance = record["camera_distance_cm"]
    if isinstance(distance, bool) or not isinstance(distance, (int, float)) or not (30 <= distance <= 300):
        errors.append("camera_distance_cm must be between 30 and 300")
    for field in ("camera_position", "lighting_conditions", "hand_configuration", "consent_status",
                  "dataset_license_status", "review_status"):
        if record[field] not in ENUMS[field]:
            errors.append(f"{field} has an invalid value: {record[field]}")
    if record["original_preserved"] is not True:
        errors.append("original_preserved must be true")
    if record["consent_status"] != "granted":
        errors.append("consent_status is not granted: record may not be used with real participant data")
    if record["review_status"] == "accepted" and record["reviewer_id"] == "none":
        errors.append("accepted records need a reviewer_id")

    annotations = record["annotations"]
    if not isinstance(annotations, list) or not annotations:
        errors.append("annotations must be a non-empty list")
        annotations = []
    previous_end = None
    for index, ann in enumerate(annotations):
        required = ("start_seconds", "end_seconds", "annotator_id", "annotation_confidence", "dispute_note")
        missing = [k for k in required if k not in ann]
        if missing:
            errors.append(f"annotation {index} missing {missing}")
            continue
        start, end = ann["start_seconds"], ann["end_seconds"]
        if not (isinstance(start, (int, float)) and isinstance(end, (int, float))):
            errors.append(f"annotation {index} times must be numbers")
            continue
        if not end > start:
            errors.append(f"annotation {index}: end_seconds must be greater than start_seconds")
        if duration is not None and end > duration:
            errors.append(f"annotation {index}: end_seconds exceeds duration_seconds")
        if previous_end is not None and start < previous_end:
            errors.append(f"annotation {index} overlaps or is out of order")
        previous_end = end
        if not re.match(ANNOTATOR_PATTERN, str(ann["annotator_id"])):
            errors.append(f"annotation {index}: annotator_id must look like ANN-01")
        if ann["annotation_confidence"] not in ENUMS["annotation_confidence"]:
            errors.append(f"annotation {index}: invalid annotation_confidence")
    return errors


def validate_collection(records: list[dict], catalog: dict[str, str]) -> dict[str, list[str]]:
    report: dict[str, list[str]] = {}
    seen_ids: dict[str, int] = {}
    seen_files: dict[str, int] = {}
    for index, record in enumerate(records):
        key = str(record.get("recording_id", f"#{index}"))
        report.setdefault(key, []).extend(validate_record(record, catalog))
        seen_ids[key] = seen_ids.get(key, 0) + 1
        source = record.get("source_file")
        if source is not None:
            seen_files[source] = seen_files.get(source, 0) + 1
    for key, count in seen_ids.items():
        if count > 1:
            report.setdefault(key, []).append(f"recording_id {key} appears {count} times")
    for source, count in seen_files.items():
        if count > 1:
            report.setdefault(f"file:{source}", []).append(f"source_file appears {count} times")
    return {k: v for k, v in report.items() if v}


def check_file_integrity(record: dict, root: Path) -> list[str]:
    path = root / record["source_file"]
    if not path.is_file():
        return [f"source file missing: {record['source_file']}"]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != record["original_sha256"]:
        return [f"sha256 mismatch for {record['source_file']}"]
    return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-catalog", action="store_true")
    args = parser.parse_args()
    if args.write_catalog:
        CATALOG.write_text(json.dumps(build_catalog(), indent=2), encoding="utf-8")
        print(f"wrote {CATALOG}")
    else:
        print("nothing to do; use --write-catalog")
    return 0


if __name__ == "__main__":
    sys.exit(main())
