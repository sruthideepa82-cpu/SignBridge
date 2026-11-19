"""Stage 0 of the phrase experiments: a read-only manifest of the 44-phrase image dataset.

The original image folder is opened for reading only. Nothing is written, moved or deleted there.
Outputs go to ai-engine/dataset/public/isl_phrases/v2/ and refuse to overwrite an existing manifest unless --overwrite.

Reused inputs are validated, not trusted:
  - image_inventory.csv: hashes, sizes, formats and duplicate groups are recomputed and compared.
  - landmarks.npz: row order and hand presence are checked against the source images.
  - phrase_inventory.csv: motion classes are checked against the documented rule.
  - the working copy under images/ must be byte-identical to the original (sha256).

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\build_manifest.py
"""

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[3]
DEFAULT_SOURCE = REPO / "Dataset for everyday phrases and words in Indian sign language" / "images for phrases"
WORKING = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
WORKING_IMAGES = WORKING / "images" / "images for phrases"
IMAGE_INVENTORY = WORKING / "image_inventory.csv"
PHRASE_INVENTORY = WORKING / "phrase_inventory.csv"
LANDMARKS = WORKING / "landmarks.npz"
DEFAULT_OUT = WORKING / "v2"

DATASET_VERSION = "isl_phrases_v2_stage0"
EXPECTED_PHRASES = 44
EXPECTED_FRAMES = 40
EXPECTED_IMAGES = 1760
THUMB_SIZE = (64, 48)
# Mean absolute difference on a 0-255 grey scale. Same threshold as the isl_static candidate pipeline
# (re-encoded copies differ by about 1; different frames of a moving hand differ by much more).
NEAR_DUP_MEAN_DIFF = 2.0
SEGMENT_SPIKE_FACTOR = 3.0
SHAPE_REVIEW_P90 = 5.0
QUALITY_POOR_UNIQUE = 15
QUALITY_GOOD_UNIQUE = 30
QUALITY_GOOD_HANDS = 35
QUALITY_POOR_HANDS = 20

STATIC_TRAIN = (
    "change", "happy birthday", "keepsmile", "mistake", "problem",
    "questions", "remember", "shift", "understand",
)
STATIC_HELD = ("sick", "opinion")
GESTURE_STATIC = "STATIC"
GESTURE_DYNAMIC = "DYNAMIC"
GESTURE_UNDETERMINED = "UNDETERMINED"

# Previous audit's approximate near-duplicate counts (greedy, same threshold). Kept for comparison only.
PREVIOUS_PIXEL_UNIQUE = {
    "again": 22, "agree": 9, "answer": 40, "attendance": 37, "book": 37, "break": 39, "careful": 17,
    "change": 38, "chat": 23, "congratulations": 20, "email": 39, "file": 33, "good morning": 27,
    "happy birthday": 28, "home": 32, "how are you": 34, "hungry": 18, "i need help": 33, "join": 20,
    "keepsmile": 34, "meet": 24, "mistake": 22, "open": 21, "opinion": 13, "pass": 32, "please": 33,
    "practice": 39, "pressure": 24, "problem": 27, "questions": 23, "remember": 33, "seat": 20, "shift": 29,
    "sick": 9, "stop": 19, "sun": 35, "team": 29, "thirsty": 18, "this": 21, "together": 27,
    "understand": 23, "wait": 17, "where": 25, "write": 20,
}

MANIFEST_FIELDS = [
    "phrase_label", "source_folder", "source_file", "frame_number", "sha256",
    "exact_duplicate_group", "is_exact_duplicate_of_earlier",
    "near_duplicate_group", "is_near_duplicate_of_earlier", "is_representative",
    "hand_detected", "left_present", "right_present", "hands_detected",
    "gesture_category", "data_quality_tier", "training_eligibility", "eligibility_reason",
    "clip_id", "clip_id_status", "segment_candidate", "possible_segment_break", "consecutive_mean_abs_diff",
    "source_frame_rate", "review_status",
    "width", "height", "mode", "real_format", "extension_matches_format",
    "working_copy_sha256_matches", "landmarks_row",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_facts(path: Path) -> dict:
    with Image.open(path) as image:
        real_format = image.format or ""
        grey = np.asarray(image.convert("RGB").convert("L").resize(THUMB_SIZE), dtype=np.float64).ravel()
        width, height = image.size
        mode = image.mode
    extension = path.suffix.lower().lstrip(".")
    extension_ok = (extension in {"jpg", "jpeg"} and real_format == "JPEG") or (extension == "png" and real_format == "PNG")
    return {
        "width": width, "height": height, "mode": mode, "real_format": real_format,
        "extension_matches_format": extension_ok, "grey": grey,
    }


def connected_components(count: int, pairs) -> list[int]:
    """Labels 0..k-1 for `count` items; items linked by any pair share a label. Deterministic."""
    parent = list(range(count))

    def find(item: int) -> int:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    for a, b in pairs:
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[max(root_a, root_b)] = min(root_a, root_b)
    labels: dict[int, int] = {}
    return [labels.setdefault(find(item), len(labels)) for item in range(count)]


def near_pairs(grey: np.ndarray, threshold: float) -> list[tuple[int, int]]:
    diff = np.abs(grey[:, None, :] - grey[None, :, :]).mean(-1)
    count = len(grey)
    return [(i, j) for i in range(count) for j in range(i + 1, count) if diff[i, j] < threshold]


def gesture_class_of(phrase: str, motion: str) -> str:
    if motion == GESTURE_STATIC:
        return "static_train" if phrase in STATIC_TRAIN else "static_hold"
    if motion == GESTURE_DYNAMIC:
        return "dynamic"
    return "undetermined"


def eligibility(phrase_class: str, hand_detected: bool, is_representative: bool) -> tuple[str, str]:
    if phrase_class == "static_train":
        if not is_representative:
            return "static_excluded_near_duplicate", "near-duplicate of the kept frame in this phrase"
        if not hand_detected:
            return "static_excluded_no_hand", "no hand detected in this frame"
        return "static_train_candidate", "kept representative frame with a detected hand"
    if phrase_class == "static_hold":
        return "static_held", "on hold: data quality too low for training (see per-class report)"
    if phrase_class == "dynamic":
        return "dynamic_sequence_member", "kept in frame order for the dynamic prototype only; not a single-frame sample"
    return "excluded_undetermined", "undetermined motion or too few hand detections"


def quality_tier(unique: int, hand_frames: int) -> str:
    if unique < QUALITY_POOR_UNIQUE or hand_frames < QUALITY_POOR_HANDS:
        return "Poor"
    if unique >= QUALITY_GOOD_UNIQUE and hand_frames >= QUALITY_GOOD_HANDS:
        return "Good"
    return "Limited"


def scan_source(source: Path) -> tuple[list[dict], list[str]]:
    issues: list[str] = []
    if not source.is_dir():
        raise SystemExit(f"Source folder not found: {source}")
    stray = sorted(p.name for p in source.iterdir() if not p.is_dir())
    if stray:
        issues.append(f"files outside phrase folders: {stray}")
    records: list[dict] = []
    for folder in sorted(p for p in source.iterdir() if p.is_dir()):
        for path in sorted(folder.iterdir()):
            if not path.is_file():
                issues.append(f"non-file entry: {folder.name}/{path.name}")
                continue
            try:
                frame = int(path.stem)
            except ValueError:
                issues.append(f"non-numeric file name: {folder.name}/{path.name}")
                continue
            records.append({
                "phrase": folder.name, "file": path.name, "frame": frame, "path": path,
                "sha256": sha256_file(path), **image_facts(path),
            })
    return records, issues


def check(validations: list[dict], name: str, ok: bool, detail: str, hard: bool = True) -> None:
    status = "pass" if ok else ("fail" if hard else "warn")
    validations.append({"name": name, "status": status, "detail": detail})


def load_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build(source: Path, out: Path) -> tuple[list[dict], dict]:
    validations: list[dict] = []
    warnings: list[str] = []

    records, issues = scan_source(source)
    phrases = sorted({r["phrase"] for r in records})
    per_phrase_counts = Counter(r["phrase"] for r in records)
    check(validations, "44 phrase folders represented", len(phrases) == EXPECTED_PHRASES, f"{len(phrases)} folders")
    check(validations, "no stray or non-numeric entries", not issues, "; ".join(issues) or "none")
    check(validations, "1760 images", len(records) == EXPECTED_IMAGES, f"{len(records)} images")
    check(validations, "40 images per phrase", all(c == EXPECTED_FRAMES for c in per_phrase_counts.values()),
          f"min {min(per_phrase_counts.values())}, max {max(per_phrase_counts.values())}")
    contiguous = all(
        sorted(r["frame"] for r in records if r["phrase"] == p) == list(range(1, EXPECTED_FRAMES + 1))
        for p in phrases
    )
    check(validations, "frame numbers 1..40 contiguous in every phrase", contiguous, "checked per folder")

    extension_mismatches = sum(not r["extension_matches_format"] for r in records)
    check(validations, "extension vs real format mismatches recorded", True,
          f"{extension_mismatches} files have a name that does not match their content (decoded by content)")

    landmarks_npz = np.load(LANDMARKS)
    lm_phrase = [str(p) for p in landmarks_npz["phrase"]]
    lm_file = [str(f) for f in landmarks_npz["image_file"]]
    landmarks = landmarks_npz["landmarks"]
    lm_index = {(p, f): i for i, (p, f) in enumerate(zip(lm_phrase, lm_file))}
    missing_lm = [(r["phrase"], r["file"]) for r in records if (r["phrase"], r["file"]) not in lm_index]
    check(validations, "every source image has a landmark row", not missing_lm, f"{len(missing_lm)} missing")
    check(validations, "landmark row count equals image count", len(lm_phrase) == len(records),
          f"{len(lm_phrase)} rows vs {len(records)} images")

    working_mismatch = []
    for r in records:
        working = WORKING_IMAGES / r["phrase"] / r["file"]
        same = working.is_file() and sha256_file(working) == r["sha256"]
        r["working_copy_sha256_matches"] = same
        if not same:
            working_mismatch.append(f"{r['phrase']}/{r['file']}")
    check(validations, "working copy byte-identical to original (sha256)", not working_mismatch,
          f"{len(working_mismatch)} differ or missing" if working_mismatch else "all 1760 match")

    inventory = {(row["phrase"], row["file"]): row for row in load_csv(IMAGE_INVENTORY)}
    inv_missing = sum((r["phrase"], r["file"]) not in inventory for r in records)
    inv_sha = sum(
        (r["phrase"], r["file"]) in inventory and inventory[(r["phrase"], r["file"])]["sha256"] != r["sha256"]
        for r in records
    )
    inv_size = sum(
        (r["phrase"], r["file"]) in inventory and (
            int(inventory[(r["phrase"], r["file"])]["width"]) != r["width"]
            or int(inventory[(r["phrase"], r["file"])]["height"]) != r["height"]
        )
        for r in records
    )
    inv_format = sum(
        (r["phrase"], r["file"]) in inventory and inventory[(r["phrase"], r["file"])]["real_format"] != r["real_format"]
        for r in records
    )
    check(validations, "image_inventory.csv covers every image", inv_missing == 0, f"{inv_missing} missing", hard=False)
    check(validations, "image_inventory.csv sha256 matches recomputed", inv_sha == 0, f"{inv_sha} mismatches", hard=False)
    check(validations, "image_inventory.csv dimensions match", inv_size == 0, f"{inv_size} mismatches", hard=False)
    check(validations, "image_inventory.csv real format matches", inv_format == 0, f"{inv_format} mismatches", hard=False)

    sha_members: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        sha_members[r["sha256"]].append(r)
    dup_group_violations = 0
    for members in sha_members.values():
        inv_groups = [inventory.get((m["phrase"], m["file"]), {}).get("duplicate_group", "") for m in members]
        if len(members) > 1:
            if any(not g for g in inv_groups) or len(set(inv_groups)) != 1:
                dup_group_violations += 1
        elif inv_groups[0]:
            dup_group_violations += 1
    check(validations, "image_inventory.csv duplicate groups match recomputed exact groups",
          dup_group_violations == 0, f"{dup_group_violations} disagreements", hard=False)

    cross_phrase_exact = [
        sha for sha, members in sha_members.items() if len({m["phrase"] for m in members}) > 1
    ]
    check(validations, "no exact duplicates across phrases", not cross_phrase_exact,
          f"{len(cross_phrase_exact)} cross-phrase groups")

    phrase_rows = {row["phrase"]: row for row in load_csv(PHRASE_INVENTORY)}
    check(validations, "phrase_inventory.csv lists the 44 phrases",
          set(phrase_rows) == set(phrases), f"{len(phrase_rows)} rows", hard=False)
    motion_counts = Counter(row["motion_class"] for row in phrase_rows.values())
    check(validations, "motion classes are 11 STATIC, 28 DYNAMIC, 5 UNDETERMINED",
          motion_counts == Counter({GESTURE_STATIC: 11, GESTURE_DYNAMIC: 28, GESTURE_UNDETERMINED: 5}),
          dict(motion_counts))
    static_listed = {p for p, row in phrase_rows.items() if row["motion_class"] == GESTURE_STATIC}
    check(validations, "STATIC set equals the 11 candidates (9 train + 2 held)",
          static_listed == set(STATIC_TRAIN) | set(STATIC_HELD), f"listed: {sorted(static_listed)}")

    rule_violations = []
    for p, row in phrase_rows.items():
        wrist, shape = parse_float(row["motion_range"]), parse_float(row["shape_p90"])
        if row["motion_class"] == GESTURE_STATIC and not (wrist is not None and shape is not None and wrist <= 0.75 and shape <= 1.0):
            rule_violations.append(f"{p}: STATIC but wrist={wrist} shape={shape}")
        if row["motion_class"] == GESTURE_DYNAMIC and wrist is not None and shape is not None and wrist <= 0.75 and shape <= 1.0:
            rule_violations.append(f"{p}: DYNAMIC but meets the static rule")
    check(validations, "motion class agrees with the documented rule (wrist<=0.75, shape p90<=1.0)",
          not rule_violations, "; ".join(rule_violations) or "all agree")

    rows_out: list[dict] = []
    per_phrase_stats: list[dict] = []
    by_phrase: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_phrase[r["phrase"]].append(r)
    for phrase in phrases:
        group_rows = sorted(by_phrase[phrase], key=lambda r: r["frame"])
        count = len(group_rows)
        grey = np.stack([r["grey"] for r in group_rows])
        diff = np.abs(grey[:, None, :] - grey[None, :, :]).mean(-1)
        pairs = [(i, j) for i in range(count) for j in range(i + 1, count) if diff[i, j] < NEAR_DUP_MEAN_DIFF]
        components = connected_components(count, pairs)
        consecutive = [None] + [float(diff[i - 1, i]) for i in range(1, count)]
        valid_consecutive = [c for c in consecutive[1:]]
        median_step = float(np.median(valid_consecutive)) if valid_consecutive else 0.0

        hand_flags = []
        for r in group_rows:
            key = (r["phrase"], r["file"])
            idx = lm_index.get(key)
            present = ~np.isnan(landmarks[idx, :, 0, 0]) if idx is not None else np.array([False, False])
            r["landmarks_row"] = idx
            r["left_present"] = bool(present[0])
            r["right_present"] = bool(present[1])
            r["hands_detected"] = int(present.sum())
            r["hand_detected"] = bool(present.any())
            hand_flags.append(r["hand_detected"])

        representative_index: dict[int, int] = {}
        for i, comp in enumerate(components):
            if comp not in representative_index:
                representative_index[comp] = i
            elif not group_rows[representative_index[comp]]["hand_detected"] and group_rows[i]["hand_detected"]:
                representative_index[comp] = i

        exact_first: dict[str, str] = {}
        first_in_component: dict[int, int] = {}
        for i, comp in enumerate(components):
            first_in_component.setdefault(comp, i)
        segment = 1
        for i, r in enumerate(group_rows):
            comp = components[i]
            is_rep = representative_index[comp] == i
            spike = consecutive[i] is not None and median_step > 0 and consecutive[i] > SEGMENT_SPIKE_FACTOR * median_step
            if spike:
                segment += 1
            is_exact_dup = r["sha256"] in exact_first
            exact_label = exact_first.setdefault(r["sha256"], f"{phrase.replace(' ', '_')}-E{len(exact_first):02d}")
            phrase_class = gesture_class_of(phrase, phrase_rows[phrase]["motion_class"])
            training, reason = eligibility(phrase_class, r["hand_detected"], is_rep)
            rows_out.append({
                "phrase_label": phrase,
                "source_folder": f"images for phrases/{phrase}",
                "source_file": r["file"],
                "frame_number": r["frame"],
                "sha256": r["sha256"],
                "exact_duplicate_group": exact_label,
                "is_exact_duplicate_of_earlier": is_exact_dup,
                "near_duplicate_group": f"{phrase.replace(' ', '_')}-N{comp:02d}",
                "is_near_duplicate_of_earlier": first_in_component[comp] != i,
                "is_representative": is_rep,
                "hand_detected": r["hand_detected"],
                "left_present": r["left_present"],
                "right_present": r["right_present"],
                "hands_detected": r["hands_detected"],
                "gesture_category": phrase_rows[phrase]["motion_class"].lower(),
                "data_quality_tier": "",
                "training_eligibility": training,
                "eligibility_reason": reason,
                "clip_id": f"{phrase.replace(' ', '_')}_clip01",
                "clip_id_status": "assumed_single_clip_unverified",
                "segment_candidate": segment,
                "possible_segment_break": spike,
                "consecutive_mean_abs_diff": "" if consecutive[i] is None else round(consecutive[i], 4),
                "source_frame_rate": "unknown",
                "review_status": (
                    "pending_isl_review" if phrase_class in ("static_train", "dynamic")
                    else "pending_isl_review_and_recapture" if phrase_class == "static_hold"
                    else "excluded_pending_review"
                ),
                "width": r["width"],
                "height": r["height"],
                "mode": r["mode"],
                "real_format": r["real_format"],
                "extension_matches_format": r["extension_matches_format"],
                "working_copy_sha256_matches": r["working_copy_sha256_matches"],
                "landmarks_row": r["landmarks_row"],
            })

        unique = len(set(components))
        hand_frames = sum(hand_flags)
        two_hand = sum(1 for r in group_rows if r["left_present"] and r["right_present"])
        exact_groups = len({r["sha256"] for r in group_rows})
        shape_p90 = parse_float(phrase_rows[phrase]["shape_p90"])
        flags = []
        if shape_p90 is not None and shape_p90 > SHAPE_REVIEW_P90:
            flags.append(f"shape_p90>{SHAPE_REVIEW_P90:g}: review landmark outliers")
        if unique < QUALITY_GOOD_UNIQUE:
            flags.append("few distinct frames")
        if hand_frames < QUALITY_GOOD_HANDS:
            flags.append("hands missing in some frames")
        per_phrase_stats.append({
            "phrase": phrase,
            "gesture_category": phrase_rows[phrase]["motion_class"],
            "phrase_class": gesture_class_of(phrase, phrase_rows[phrase]["motion_class"]),
            "images": count,
            "exact_unique": exact_groups,
            "exact_duplicate_files": count - exact_groups,
            "near_components": unique,
            "near_duplicate_files": count - unique,
            "largest_near_component": max(Counter(components).values()),
            "hand_frames": hand_frames,
            "two_hand_frames": two_hand,
            "wrist_range": phrase_rows[phrase]["motion_range"],
            "shape_p90": phrase_rows[phrase]["shape_p90"],
            "segment_breaks_possible": sum(1 for x in rows_out[-count:] if x["possible_segment_break"]),
            "previous_audit_pixel_unique": PREVIOUS_PIXEL_UNIQUE.get(phrase),
            "data_quality_tier": quality_tier(unique, hand_frames),
            "flags": "; ".join(flags),
        })

    tier_by_phrase = {s["phrase"]: s["data_quality_tier"] for s in per_phrase_stats}
    for row in rows_out:
        row["data_quality_tier"] = tier_by_phrase[row["phrase_label"]]

    eligibility_counts = Counter(row["training_eligibility"] for row in rows_out)
    static_train_rows = [r for r in rows_out if r["training_eligibility"] == "static_train_candidate"]
    static_train_per_class = Counter(r["phrase_label"] for r in static_train_rows)
    check(validations, "static training candidates only from the 9 approved classes",
          set(static_train_per_class) <= set(STATIC_TRAIN), f"{sorted(static_train_per_class)}")
    check(validations, "held and dynamic phrases are not static training candidates",
          not any(r["phrase_label"] in STATIC_HELD or r["gesture_category"] != "static" for r in static_train_rows),
          "checked")
    check(validations, "undetermined phrases are excluded",
          all(r["training_eligibility"] == "excluded_undetermined" for r in rows_out if r["gesture_category"] == "undetermined"),
          "checked")
    check(validations, "static training candidates are not near-duplicates",
          all(r["is_representative"] for r in static_train_rows), "checked")

    manifest_rows = sorted(rows_out, key=lambda r: (r["phrase_label"], r["frame_number"]))
    summary = {
        "dataset_version": DATASET_VERSION,
        "stage": 0,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "script": "ai-engine/training/phrase_experiments/build_manifest.py",
        "source_folder": str(source),
        "source_mode": "read-only; originals are opened for reading and never written",
        "working_copy": "ai-engine/dataset/public/isl_phrases/images/images for phrases",
        "landmarks_sha256": hashlib.sha256(LANDMARKS.read_bytes()).hexdigest(),
        "source_frame_rate": "unknown",
        "assumptions": [
            "Each phrase folder is one assumed clip (clip_id ..._clip01). Not verified.",
            "Frame numbers are treated as order only. Time spacing is unknown.",
            "Near-duplicates: mean absolute grey difference below 2.0 on a 64x48 thumbnail, grouped by connected components.",
            "Static representatives: the earliest frame with a detected hand in each near-duplicate group.",
            "Dynamic phrases are never single-frame training samples.",
        ],
        "counts": {
            "phrase_folders": len(phrases),
            "images": len(records),
            "exact_duplicate_files": sum(s["exact_duplicate_files"] for s in per_phrase_stats),
            "near_duplicate_files": sum(s["near_duplicate_files"] for s in per_phrase_stats),
            "eligibility": dict(eligibility_counts),
            "static_train_candidates_per_class": dict(static_train_per_class),
            "static_train_candidates_total": len(static_train_rows),
            "data_quality_tiers": dict(Counter(s["data_quality_tier"] for s in per_phrase_stats)),
        },
        "validations": validations,
        "warnings": [v["detail"] for v in validations if v["status"] == "warn"],
    }
    return manifest_rows, {"summary": summary, "per_phrase": per_phrase_stats, "records": records, "issues": issues,
                           "phrase_rows": phrase_rows, "inventory_mismatch": {"sha": inv_sha, "size": inv_size,
                                                                              "format": inv_format}}


def write_outputs(out: Path, manifest_rows: list[dict], bundle: dict) -> None:
    out.mkdir(parents=True, exist_ok=True)
    reports = out / "reports"
    reports.mkdir(exist_ok=True)

    with open(out / "phrase_manifest.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        writer.writerows(manifest_rows)

    summary = bundle["summary"]
    (out / "dataset_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    per_phrase = bundle["per_phrase"]
    fields = list(per_phrase[0].keys())
    with open(reports / "per_class_quality.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(per_phrase)

    lines = [
        "# Per-class quality report (Stage 0)", "",
        f"Dataset version `{DATASET_VERSION}`. Source frame rate: unknown. Each folder assumed to be one clip.", "",
        "Quality tiers: **Good** = at least 30 distinct frames and hands in at least 35 of 40. **Poor** = fewer than 15 "
        "distinct frames or fewer than 20 frames with hands. **Limited** = everything else.", "",
        "| Phrase | Gesture | Training class | Images | Exact-unique | Near-unique | Previous audit | Hand frames | Two-hand | Shape p90 | Tier | Flags |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ]
    for s in per_phrase:
        lines.append(
            f"| {s['phrase']} | {s['gesture_category'].lower()} | {s['phrase_class']} | {s['images']} | "
            f"{s['exact_unique']} | {s['near_components']} | {s['previous_audit_pixel_unique']} | "
            f"{s['hand_frames']} | {s['two_hand_frames']} | {s['shape_p90']} | {s['data_quality_tier']} | {s['flags']} |"
        )
    (reports / "per_class_quality.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    records = bundle["records"]
    sha_members: dict[str, set[str]] = defaultdict(set)
    for r in records:
        sha_members[r["sha256"]].add(r["phrase"])
    exact_groups = [(sha, sorted(members)) for sha, members in sha_members.items()]
    lines = [
        "# Duplicate report (Stage 0)", "",
        "Exact duplicates are byte-identical files (sha256). Near-duplicates are frames whose 64x48 grey thumbnails differ "
        f"by a mean absolute value below {NEAR_DUP_MEAN_DIFF}. Near groups are connected components, so a chain of similar "
        "frames forms one group. Duplicates are recorded in the manifest, never deleted from the originals.", "",
        "## Totals", "",
        f"- Exact duplicate files (all phrases): {summary['counts']['exact_duplicate_files']}",
        f"- Near-duplicate files (non-representative, all phrases): {summary['counts']['near_duplicate_files']}",
        f"- Cross-phrase exact groups: {sum(1 for _, members in exact_groups if len(members) > 1)}", "",
        "## Per phrase", "",
        "| Phrase | Images | Exact duplicate files | Near-duplicate files | Largest near group | Previous audit (distinct) |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for s in per_phrase:
        lines.append(
            f"| {s['phrase']} | {s['images']} | {s['exact_duplicate_files']} | {s['near_duplicate_files']} | "
            f"{s['largest_near_component']} | {s['previous_audit_pixel_unique']} |"
        )
    lines += ["", "## Chaining caution", "",
              "Near groups are linked transitively. Where the largest group is large, the 'distinct' count may be "
              "lower than the number of visually different frames. Treat these counts as approximate."]
    (reports / "duplicate_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    excluded_lines = [
        "# Excluded and held classes (Stage 0)", "",
        "Nothing is deleted. Every excluded frame remains in `phrase_manifest.csv` with its reason.", "",
        "## Undetermined (excluded from all training)", "",
        "| Phrase | Images | Hand frames | Reason | Needed before any use |",
        "| --- | ---: | ---: | --- | --- |",
    ]
    by_name = {s["phrase"]: s for s in per_phrase}
    for s in per_phrase:
        if s["phrase_class"] == "undetermined":
            excluded_lines.append(
                f"| {s['phrase']} | {s['images']} | {s['hand_frames']} | too few hand detections | "
                "new recordings with hands clearly visible; ISL review |"
            )
    excluded_lines += ["", "## Held static classes (not trained in Stage 1)", "",
                       "| Phrase | Images | Near-unique | Reason | Needed before any use |", "| --- | ---: | ---: | --- | --- |"]
    for name in STATIC_HELD:
        s = by_name[name]
        excluded_lines.append(
            f"| {name} | {s['images']} | {s['near_components']} | {s['flags'] or 'data quality'} | "
            "re-capture with varied frames and an ISL review |"
        )
    excluded_lines += ["", "## Dynamic phrases (not single-frame classes)", "",
                       "All 28 are excluded from the single-frame static model. They are kept in frame order for the Stage 2 prototype only.", "",
                       "| Phrase | Images | Near-unique | Quality | Reason |", "| --- | ---: | ---: | --- | --- |"]
    for s in per_phrase:
        if s["phrase_class"] == "dynamic":
            excluded_lines.append(
                f"| {s['phrase']} | {s['images']} | {s['near_components']} | {s['data_quality_tier']} | "
                "motion cannot be learned from a single frame |"
            )
    (reports / "excluded_classes.md").write_text("\n".join(excluded_lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--overwrite", action="store_true", help="replace an existing v2 manifest")
    args = parser.parse_args()

    if (args.out / "phrase_manifest.csv").exists() and not args.overwrite:
        print(f"Refusing to overwrite {args.out / 'phrase_manifest.csv'}. Use --overwrite to replace it.")
        return 2

    rows, bundle = build(args.source, args.out)
    write_outputs(args.out, rows, bundle)

    failed = [v for v in bundle["summary"]["validations"] if v["status"] == "fail"]
    for v in bundle["summary"]["validations"]:
        print(f"[{v['status']}] {v['name']}: {v['detail']}")
    print(f"wrote {args.out / 'phrase_manifest.csv'} ({len(rows)} rows)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
