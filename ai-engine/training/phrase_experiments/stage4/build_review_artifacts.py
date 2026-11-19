"""Stage 4: build the human-review register, the ISL verification register and the dataset quality report.

Reads Stage 3 outputs (read-only) and the Stage 0 manifest (read-only). Writes only inside
ai-engine/training/phrase_experiments/stage4/. Never edits a sample, a label or a Stage 0-3 file.

Granularity: one review row per flagged sample, meaning one dynamic frame, one reported hand and one flag. Stage 3's
11 visual-check runs map to 11 such rows.

Verification fields are left pending: nothing here records an ISL meaning or a verified label.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\stage4\\build_review_artifacts.py
"""

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = Path(__file__).resolve().parents[4]
STAGE3 = REPO / "ai-engine" / "training" / "phrase_experiments" / "stage3"
MANIFEST = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases" / "v2" / "phrase_manifest.csv"

PRIORITY_CLASSES = {"book", "open", "practice", "seat", "team"}
CAUSE_ORDER = ["CONFIRMED_DETECTOR_FAILURE", "POSSIBLE_DETECTOR_FAILURE", "CAMERA_FRAMING",
               "UNCERTAIN", "POSSIBLE_GENUINE_VARIATION"]
CATEGORY = {
    "CONFIRMED_DETECTOR_FAILURE": "1. Confirmed detector failure",
    "POSSIBLE_DETECTOR_FAILURE": "2. Possible detector failure",
    "POSSIBLE_GENUINE_VARIATION": "3. Possible genuine signer variation",
    "CAMERA_FRAMING": "4. Camera/framing problem",
    "UNCERTAIN": "5. Uncertain anomaly",
}
CATEGORY_MEANING = {
    "1. Confirmed detector failure": "visual check shows the landmarks contradict the image (one automated reviewer, still image)",
    "2. Possible detector failure": "visual or rule evidence of a detector error, not proven",
    "3. Possible genuine signer variation": "motion or pose that may be real signing",
    "4. Camera/framing problem": "wrist at or beyond the frame edge",
    "5. Uncertain anomaly": "no visual check, and the rule cannot decide",
}
sys.path.insert(0, str(STAGE3))
from anomaly_report import VISUAL_CHECKS  # noqa: E402  (read-only import of Stage 3's list of checked frames)

REVIEW_PENDING = "REV-PENDING"
DECISION_VOCABULARY = [
    "CONFIRMED_DETECTOR_FAILURE", "POSSIBLE_DETECTOR_FAILURE", "GENUINE_VARIATION",
    "CAMERA_FRAMING", "CANNOT_DECIDE", "NEEDS_ISL_REVIEW",
]
REGISTER_FIELDS = [
    "review_id", "phrase_id", "phrase_label", "frame_number", "source_file", "original_location",
    "slot_reported", "anomaly_flag", "anomaly_run_ids", "stage3_primary_cause", "review_category",
    "stage3_visual_check", "stage3_evidence", "review_priority", "reason_for_review",
    "reviewer_1_id", "reviewer_1_decision", "reviewer_1_notes",
    "reviewer_2_id", "reviewer_2_decision", "reviewer_2_notes",
    "reconciled_decision", "review_status", "data_action",
]
ISL_FIELDS = [
    "phrase_id", "phrase_name", "dataset_label_status", "intended_meaning_isl_expert", "isl_verification_status",
    "reviewer_identity", "verification_notes", "disagreement_status", "dispute_reference",
    "final_approval_status", "approval_authority", "evidence_reference",
]


def load_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def phrase_catalog() -> list[dict]:
    data = json.loads((STAGE3 / "phrase_catalog.json").read_text(encoding="utf-8"))
    return [{"phrase_id": p["phrase_id"], "phrase_label": p["phrase_label"]} for p in data["phrases"]]


def frame_range(text: str) -> set[int]:
    lo, _, hi = text.partition("-")
    hi = hi or lo
    return set(range(int(lo), int(hi) + 1))


def make_row(phrase: str, number: int, frame: dict, slot: str, flag: str, runs: list[dict], phrase_ids: dict) -> dict:
    matching = [r for r in runs if r["phrase"] == phrase and r["slot"] == slot
                and number in r["frames_set"] and r["anomaly"] == flag]
    causes = {r["cause_label"] for r in matching}
    primary = next((c for c in CAUSE_ORDER if c in causes), "UNCERTAIN")
    visual = [c for c in VISUAL_CHECKS if c["phrase"] == phrase and c["slot"] == slot and number in c["frames"]]
    if visual:
        visual = [dict(v, evidence=v["finding"]) for v in visual]
        primary = visual[0]["label"]
    elif primary == "CONFIRMED_DETECTOR_FAILURE":
        primary = "POSSIBLE_DETECTOR_FAILURE"
    if phrase in PRIORITY_CLASSES or primary == "CONFIRMED_DETECTOR_FAILURE":
        priority = "HIGH"
    elif primary in {"POSSIBLE_DETECTOR_FAILURE", "CAMERA_FRAMING"}:
        priority = "MEDIUM"
    else:
        priority = "LOW"
    if visual:
        reason = "Stage 3 visual check: needs independent human confirmation"
        status = "stage3_visual_check_pending_human_review"
        evidence = " | ".join(sorted({r["evidence"] for r in visual}))
    else:
        reason = f"HIGH-priority class {phrase}" if phrase in PRIORITY_CLASSES else f"flagged sample ({flag})"
        status = "pending_independent_review"
        evidence = "rule-based: " + ("; ".join(sorted({
            f"{r['anomaly']} run {r['frames']} min_size {r['min_hand_size']} max_step {r['max_abs_step']}"
            for r in matching})) or "no run matched")
    return {
        "review_id": "",
        "phrase_id": phrase_ids[phrase],
        "phrase_label": phrase,
        "frame_number": number,
        "source_file": frame["source_file"],
        "original_location": f"Dataset .../images for phrases/{phrase}/{frame['source_file']}",
        "slot_reported": slot,
        "anomaly_flag": flag,
        "anomaly_run_ids": ";".join(r["run_id"] for r in matching),
        "stage3_primary_cause": primary,
        "review_category": CATEGORY[primary],
        "stage3_visual_check": "yes" if visual else "no",
        "stage3_evidence": evidence,
        "review_priority": priority,
        "reason_for_review": reason,
        "reviewer_1_id": REVIEW_PENDING,
        "reviewer_1_decision": "",
        "reviewer_1_notes": "",
        "reviewer_2_id": REVIEW_PENDING,
        "reviewer_2_decision": "",
        "reviewer_2_notes": "",
        "reconciled_decision": "",
        "review_status": status,
        "data_action": "none: sample retained unchanged",
    }


def build_review_register(anomalies: list[dict], frames: list[dict]) -> list[dict]:
    phrase_ids = {p["phrase_label"]: p["phrase_id"] for p in phrase_catalog()}
    runs = [dict(r, run_id=f"AR-{i:03d}", frames_set=frame_range(r["frames"])) for i, r in enumerate(anomalies, start=1)]
    rows = []
    for frame in frames:
        phrase, number = frame["phrase"], int(frame["frame_number"])
        for slot in ("left", "right"):
            for flag in (f for f in (frame[f"{slot}_flags"] or "").split(";") if f):
                rows.append(make_row(phrase, number, frame, slot, flag, runs, phrase_ids))
    rows.sort(key=lambda r: (r["phrase_label"], int(r["frame_number"]), r["slot_reported"], r["anomaly_flag"]))
    for i, row in enumerate(rows, start=1):
        row["review_id"] = f"HR-{i:04d}"
    return rows


def build_isl_register() -> list[dict]:
    return [{
        "phrase_id": entry["phrase_id"],
        "phrase_name": entry["phrase_label"],
        "dataset_label_status": "unverified: taken from the Stage 0 manifest",
        "intended_meaning_isl_expert": "",
        "isl_verification_status": "pending",
        "reviewer_identity": REVIEW_PENDING,
        "verification_notes": "",
        "disagreement_status": "none recorded",
        "dispute_reference": "",
        "final_approval_status": "not approved",
        "approval_authority": "qualified ISL expert: not yet identified",
        "evidence_reference": "stage3/dataset_quality_research.md; stage3/recording_protocol.md section 7",
    } for entry in phrase_catalog()]


def build_quality_report(register: list[dict], frames: list[dict]) -> str:
    total_frames = len(frames)
    flagged_frames = {(r["phrase_label"], r["frame_number"]) for r in register}
    by_category = Counter(r["review_category"] for r in register)
    by_priority = Counter(r["review_priority"] for r in register)
    by_class: dict = defaultdict(Counter)
    for r in register:
        by_class[r["phrase_label"]][r["review_category"]] += 1
    visual = [r for r in register if r["stage3_visual_check"] == "yes"]
    lines = [
        "# Dataset quality report (Stage 4)", "",
        "> Categories come from Stage 3 automated labels and visual checks. **No sample has been reviewed by an independent",
        "> human reviewer.** Nothing has been removed or modified. Every category is provisional.", "",
        "## Totals", "",
        f"- Dynamic frames checked: {total_frames} (28 classes x 40).",
        f"- Flagged samples (one row per frame, hand and flag): {len(register)}.",
        f"- Frames with at least one flag: {len(flagged_frames)}; frames with no flag: {total_frames - len(flagged_frames)}.",
        "- Samples with independent human review: **0**.", "",
        "## Categories (flagged samples)", "",
        "| Category | Count | Meaning |", "| --- | ---: | --- |",
    ]
    for cat in sorted(CATEGORY.values()):
        lines.append(f"| {cat} | {by_category.get(cat, 0)} | {CATEGORY_MEANING[cat]} |")
    lines += [
        "| 6. Unreviewed samples | all 1,120 frames | no independent human review has been done for any frame |", "",
        f"By review priority: HIGH {by_priority.get('HIGH', 0)}, MEDIUM {by_priority.get('MEDIUM', 0)}, LOW {by_priority.get('LOW', 0)}.", "",
        "## Stage 3 visual checks (automated reviewer, still images)", "",
        f"{len(visual)} rows. Each needs independent human confirmation.", "",
        "| Review ID | Class | Frame | Hand | Flag | Stage 3 finding |", "| --- | --- | ---: | --- | --- | --- |",
    ]
    for r in visual:
        finding = r["stage3_evidence"].replace("|", "/")
        lines.append(f"| {r['review_id']} | {r['phrase_label']} | {r['frame_number']} | {r['slot_reported']} | "
                     f"{r['anomaly_flag']} | {finding} |")
    lines += ["", "## Per-class counts", "", "| Class | Flagged samples | Categories |", "| --- | ---: | --- |"]
    for phrase in sorted({f["phrase"] for f in frames}):
        counts = by_class.get(phrase, Counter())
        total = sum(counts.values())
        detail = "; ".join(f"{k} x{v}" for k, v in sorted(counts.items())) or "none"
        lines.append(f"| {phrase} | {total} | {detail} |")
    lines += ["", "## Corrections applied at register level (Stage 3 files unchanged)", "",
              "- Stage 3 labelled whole anomaly runs CONFIRMED when only one frame in the run was visually checked. In this register,",
              "  CONFIRMED is given only to the visually checked frames. Other frames of those runs are POSSIBLE_DETECTOR_FAILURE.",
              "- `seat` frame 29 was part of the visual check but has no flag, so it has no register row. Frame 29 is listed in",
              "  the Stage 3 visual-check text only. Its review is still needed.",
              "- `open` frame 10 is a reference frame with no flag and is not in the register.", "",
              "## Not claimed", "",
              "- No ISL meaning, verification or approval.",
              "- No accuracy, generalisation or signer independence.",
              "- No removal or modification of any sample."]
    return "\n".join(lines) + "\n"


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    anomalies = load_csv(STAGE3 / "anomaly_report.csv")
    frames = load_csv(STAGE3 / "reports" / "frame_diagnostics.csv")
    manifest = load_csv(MANIFEST)
    dynamic_manifest = [r for r in manifest if r["gesture_category"] == "dynamic"]
    if len(dynamic_manifest) != 1120 or len(frames) != 1120:
        raise SystemExit("unexpected dynamic frame counts; refusing to build the review register")

    register = build_review_register(anomalies, frames)
    isl = build_isl_register()
    write_csv(HERE / "human_review_register.csv", register, REGISTER_FIELDS)
    write_csv(HERE / "isl_verification_register.csv", isl, ISL_FIELDS)
    (HERE / "dataset_quality_report.md").write_text(build_quality_report(register, frames), encoding="utf-8")
    print(f"review rows {len(register)} | ISL rows {len(isl)} | visual-check rows "
          f"{sum(r['stage3_visual_check'] == 'yes' for r in register)}")
    print(f"categories {dict(Counter(r['review_category'] for r in register))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
