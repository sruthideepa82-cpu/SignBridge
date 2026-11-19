"""Stage 3: per-class anomaly report and recapture recommendations for the 28 dynamic classes.

Reads reports/frame_diagnostics.csv (written by frame_diagnostics.py). Writes anomaly_report.csv and
reports/recapture_recommendations.csv. Nothing is discarded: every flagged run stays in the data, with its label.

Cause labels:
  CONFIRMED_DETECTOR_FAILURE   visual check shows the reported landmarks contradict the image
  POSSIBLE_DETECTOR_FAILURE    visual check or rule suggests a detector error; not proven
  POSSIBLE_GENUINE_VARIATION   motion or pose that may be real signing
  CAMERA_FRAMING               geometry shows the hand at or beyond the frame edge
  UNCERTAIN                    no visual check; the rule cannot decide

Visual checks were made by one reviewer (an automated assistant reading the still images), not by a qualified
annotator. Every visual label must be re-checked by a human reviewer before any claim is made from it.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\stage3\\anomaly_report.py
"""

import csv
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPORTS = HERE / "reports"
DIAG = REPORTS / "frame_diagnostics.csv"

FLAG_ORDER = ["abs_jump", "size_low", "size_high", "collapsed_span", "jump", "wrist_at_edge"]
ABS_STEP_LIMIT = 0.25  # must match frame_diagnostics.py

VISUAL_CHECKS = [
    {"phrase": "seat", "frames": {29, 30}, "slot": "right", "label": "CONFIRMED_DETECTOR_FAILURE",
     "finding": "Both hands visible in both frames. The image-right hand is in the same place in frames 29 and 30 but "
                "is labelled Left in frame 29 and Right in frame 30. The other hand is not reported in frame 30."},
    {"phrase": "open", "frames": {35}, "slot": "right", "label": "CONFIRMED_DETECTOR_FAILURE",
     "finding": "Hand clearly visible at normal size. Stored wrist-to-knuckle distance is about 0.008; frame 10 of the same "
                "clip, with a visible hand of the same kind, gives about 0.12."},
    {"phrase": "book", "frames": {9}, "slot": "left", "label": "CONFIRMED_DETECTOR_FAILURE",
     "finding": "Two palm-up hands visible. Only one hand is reported (left, collapsed size 0.015)."},
    {"phrase": "team", "frames": {14}, "slot": "left", "label": "POSSIBLE_DETECTOR_FAILURE",
     "finding": "Hands overlap in front of the body. One hand is reported with collapsed size 0.0074. Occlusion is likely."},
    {"phrase": "team", "frames": {5}, "slot": "left", "label": "POSSIBLE_DETECTOR_FAILURE",
     "finding": "Hands clasped and interlaced. One hand reported with size 0.0039. May also be a genuine pose: ISL review needed."},
    {"phrase": "practice", "frames": {35}, "slot": "left", "label": "POSSIBLE_DETECTOR_FAILURE",
     "finding": "Two hands interlocked. Left size 0.029. Occlusion is likely; interlocking may be a genuine part of the sign."},
]
REFERENCE_FRAMES = [("open", 10, "normal hand size 0.12, no anomaly")]


def load() -> dict[str, list[dict]]:
    with open(DIAG, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    by_phrase: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_phrase[r["phrase"]].append(r)
    for phrase in by_phrase:
        by_phrase[phrase].sort(key=lambda r: int(r["frame_number"]))
    return by_phrase


def runs(frames: list[dict], slot: str, flag: str) -> list[list[dict]]:
    out, current = [], []
    for r in frames:
        if flag in (r[f"{slot}_flags"] or "").split(";") and r[f"{slot}_flags"]:
            current.append(r)
        else:
            if current:
                out.append(current)
            current = []
    if current:
        out.append(current)
    return out


def visual_label(phrase: str, slot: str, run_frames: set[int]) -> dict | None:
    for check in VISUAL_CHECKS:
        if check["phrase"] == phrase and check["slot"] == slot and check["frames"] & run_frames:
            return check
    return None


def rule_label(flag: str, run: list[dict], slot: str) -> str:
    if flag == "abs_jump":
        return "POSSIBLE_DETECTOR_FAILURE"
    if flag == "wrist_at_edge":
        return "CAMERA_FRAMING"
    if flag == "size_low":
        spans = [float(r[f"{slot}_span"]) for r in run if r[f"{slot}_span"]]
        if spans and min(spans) >= 0.15:
            return "UNCERTAIN"
        return "POSSIBLE_DETECTOR_FAILURE"
    if flag == "jump":
        steps = [float(r[f"{slot}_abs_step"]) for r in run if r[f"{slot}_abs_step"]]
        if steps and max(steps) > ABS_STEP_LIMIT:
            return "POSSIBLE_DETECTOR_FAILURE"
        return "POSSIBLE_GENUINE_VARIATION"
    return "UNCERTAIN"


RECOMMENDATION = {
    "CONFIRMED_DETECTOR_FAILURE": "recapture with both hands fully in frame and well separated; keep this clip for error analysis",
    "POSSIBLE_DETECTOR_FAILURE": "recapture with hands separated; ask a reviewer to confirm the pose",
    "CAMERA_FRAMING": "recapture with the whole signing space inside the frame",
    "POSSIBLE_GENUINE_VARIATION": "keep; check motion with the reviewer before treating it as an error",
    "UNCERTAIN": "keep; human review of the frames before deciding",
}


def main() -> int:
    by_phrase = load()
    if len(by_phrase) != 28:
        raise SystemExit(f"expected 28 dynamic phrases, found {len(by_phrase)}")
    report_rows = []
    per_class: dict[str, list[str]] = defaultdict(list)
    for phrase, frames in by_phrase.items():
        for slot in ("left", "right"):
            for flag in FLAG_ORDER:
                for run in runs(frames, slot, flag):
                    numbers = [int(r["frame_number"]) for r in run]
                    visual = visual_label(phrase, slot, set(numbers))
                    label = visual["label"] if visual else rule_label(flag, run, slot)
                    evidence = visual["finding"] if visual else (
                        f"rule: {flag}; min size {min(float(r[f'{slot}_size']) for r in run if r[f'{slot}_size']):.4f}; "
                        f"max abs step {max((float(r[f'{slot}_abs_step']) for r in run if r[f'{slot}_abs_step']), default=0):.3f}"
                    )
                    sizes = [float(r[f"{slot}_size"]) for r in run if r[f"{slot}_size"]]
                    steps = [float(r[f"{slot}_abs_step"]) for r in run if r[f"{slot}_abs_step"]]
                    report_rows.append({
                        "phrase": phrase,
                        "slot": slot,
                        "anomaly": flag,
                        "frames": f"{numbers[0]}-{numbers[-1]}" if len(numbers) > 1 else str(numbers[0]),
                        "n_frames": len(numbers),
                        "min_hand_size": round(min(sizes), 4) if sizes else "",
                        "max_abs_step": round(max(steps), 4) if steps else "",
                        "cause_label": label,
                        "visual_check": "yes" if visual else "no",
                        "evidence": evidence,
                        "recommendation": RECOMMENDATION[label],
                        "data_status": "retained; not discarded",
                    })
                    per_class[phrase].append(label)

    if not report_rows:
        raise SystemExit("no anomalies found")
    with open(HERE / "anomaly_report.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(report_rows[0].keys()))
        writer.writeheader()
        writer.writerows(report_rows)

    priority = {"open", "book", "team", "practice", "seat"}
    recs = []
    for phrase in sorted(by_phrase):
        labels = per_class.get(phrase, [])
        confirmed = labels.count("CONFIRMED_DETECTOR_FAILURE")
        possible = labels.count("POSSIBLE_DETECTOR_FAILURE")
        framing = labels.count("CAMERA_FRAMING")
        if phrase in priority:
            tier = "HIGH: recapture"
        elif confirmed or possible or framing or len(labels) >= 3:
            tier = "MEDIUM: recapture or review"
        elif labels:
            tier = "LOW: keep; minor flags"
        else:
            tier = "NONE: keep"
        recs.append({"phrase": phrase, "anomaly_runs": len(labels), "confirmed": confirmed, "possible_detector": possible,
                     "camera_framing": framing, "tier": tier})
    with open(REPORTS / "recapture_recommendations.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(recs[0].keys()))
        writer.writeheader()
        writer.writerows(recs)

    print(f"anomaly runs: {len(report_rows)}")
    for r in recs:
        print(f"{r['phrase']:16s} runs {r['anomaly_runs']:2d} confirmed {r['confirmed']} possible {r['possible_detector']} "
              f"framing {r['camera_framing']} -> {r['tier']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
