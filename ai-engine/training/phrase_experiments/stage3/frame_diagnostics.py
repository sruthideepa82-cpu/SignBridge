"""Stage 3 Workstream A: frame-level diagnostics for the 28 dynamic phrase classes.

Read-only. Inputs: the Stage 0 manifest (dynamic rows only, authoritative class list) and the stored IMAGE-mode
landmarks. Writes only to ai-engine/training/phrase_experiments/stage3/reports/ and anomaly_report.csv.

Every flag here is a SYMPTOM, not a cause. Cause labels (confirmed / possible detector failure, possible genuine
variation, uncertain) are assigned in anomaly_report.csv by explicit, documented rules, and visual checks are noted
separately.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\stage3\\frame_diagnostics.py
"""

import csv
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = Path(__file__).resolve().parents[4]
ISL = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
MANIFEST = ISL / "v2" / "phrase_manifest.csv"
LANDMARKS = ISL / "landmarks.npz"
REPORTS = HERE / "reports"

WRIST, MCP = 0, 9
SIZE_LOW, SIZE_HIGH = 0.03, 0.6          # same thresholds as the Stage 2 quality report
COLLAPSED_SPAN = 0.02                     # hand bounding box smaller than this (image fraction) is implausible
JUMP_LIMIT = 1.5                          # wrist moved more than 1.5 hand-sizes in one frame
ABS_STEP_LIMIT = 0.25                     # wrist moved more than a quarter of the image between processed frames
EDGE = 0.02                               # wrist within 2% of a frame border
OPEN_EDGE = 1.0


def read_dynamic_rows() -> dict[str, list[dict]]:
    import csv as _csv

    with open(MANIFEST, encoding="utf-8", newline="") as handle:
        rows = list(_csv.DictReader(handle))
    dynamic = [r for r in rows if r["gesture_category"] == "dynamic"]
    by_phrase: dict[str, list[dict]] = defaultdict(list)
    for r in dynamic:
        by_phrase[r["phrase_label"]].append(r)
    for phrase in by_phrase:
        by_phrase[phrase].sort(key=lambda r: int(r["frame_number"]))
    return dict(sorted(by_phrase.items()))


def hand_metrics(hand: np.ndarray) -> dict:
    size = float(np.linalg.norm(hand[MCP, :2] - hand[WRIST, :2]))
    span_x = float(hand[:, 0].max() - hand[:, 0].min())
    span_y = float(hand[:, 1].max() - hand[:, 1].min())
    wrist = hand[WRIST, :2]
    edge = bool(np.any(wrist < EDGE) or np.any(wrist > 1 - EDGE))
    return {"size": size, "span": max(span_x, span_y), "wrist_x": float(wrist[0]), "wrist_y": float(wrist[1]), "edge": edge}


def diagnose(phrase: str, rows: list[dict], landmarks: np.ndarray) -> list[dict]:
    frames = []
    previous = {0: None, 1: None}
    for t, r in enumerate(rows):
        raw = landmarks[int(r["landmarks_row"])].astype(np.float64)
        slot_present = ~np.isnan(raw[:, 0, 0])
        record = {"phrase": phrase, "frame_number": int(r["frame_number"]), "source_file": r["source_file"]}
        for slot, name in ((0, "left"), (1, "right")):
            present = bool(slot_present[slot])
            record[f"{name}_present"] = present
            flags = []
            if present:
                hand = np.nan_to_num(raw[slot])
                m = hand_metrics(hand)
                record[f"{name}_size"] = round(m["size"], 5)
                record[f"{name}_span"] = round(m["span"], 5)
                record[f"{name}_wrist_x"] = round(m["wrist_x"], 5)
                record[f"{name}_wrist_y"] = round(m["wrist_y"], 5)
                if m["size"] < SIZE_LOW:
                    flags.append("size_low")
                if m["size"] > SIZE_HIGH:
                    flags.append("size_high")
                if m["span"] < COLLAPSED_SPAN:
                    flags.append("collapsed_span")
                if m["edge"]:
                    flags.append("wrist_at_edge")
                prev = previous[slot]
                if prev is not None:
                    step = float(np.linalg.norm(hand[WRIST, :2] - prev[WRIST, :2]))
                    scale = max(m["size"], 1e-6)
                    record[f"{name}_jump_hand_sizes"] = round(step / scale, 4)
                    record[f"{name}_abs_step"] = round(step, 4)
                    if step / scale > JUMP_LIMIT:
                        flags.append("jump")
                    if step > ABS_STEP_LIMIT:
                        flags.append("abs_jump")
                else:
                    record[f"{name}_jump_hand_sizes"] = ""
                    record[f"{name}_abs_step"] = ""
                previous[slot] = hand
            else:
                record[f"{name}_size"] = ""
                record[f"{name}_span"] = ""
                record[f"{name}_wrist_x"] = ""
                record[f"{name}_wrist_y"] = ""
                record[f"{name}_jump_hand_sizes"] = ""
                record[f"{name}_abs_step"] = ""
                previous[slot] = None
            record[f"{name}_flags"] = ";".join(flags)
        frames.append(record)
    for i, rec in enumerate(frames):
        prev = frames[i - 1] if i else None
        transition = []
        if prev is not None:
            for name in ("left", "right"):
                if prev[f"{name}_present"] != rec[f"{name}_present"]:
                    transition.append(f"{name}_{'appears' if rec[f'{name}_present'] else 'disappears'}")
        rec["presence_transition"] = ";".join(transition)
        rec["two_hands"] = rec["left_present"] and rec["right_present"]
    return frames


def main() -> int:
    REPORTS.mkdir(parents=True, exist_ok=True)
    landmarks = np.load(LANDMARKS)["landmarks"]
    by_phrase = read_dynamic_rows()
    if len(by_phrase) != 28:
        raise SystemExit(f"expected 28 dynamic phrases, found {len(by_phrase)}")
    all_frames = []
    for phrase, rows in by_phrase.items():
        all_frames.extend(diagnose(phrase, rows, landmarks))

    fields = list(all_frames[0].keys())
    with open(REPORTS / "frame_diagnostics.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(all_frames)

    summary = []
    for phrase in by_phrase:
        frames = [f for f in all_frames if f["phrase"] == phrase]
        left = sum(f["left_present"] for f in frames)
        right = sum(f["right_present"] for f in frames)
        both = sum(f["two_hands"] for f in frames)
        flags = defaultdict(int)
        flagged_frames = []
        for f in frames:
            for side in ("left", "right"):
                for flag in filter(None, f[f"{side}_flags"].split(";")):
                    flags[f"{side}:{flag}"] += 1
                    flagged_frames.append(f["frame_number"])
        transitions = sum(1 for f in frames if f["presence_transition"])
        summary.append({
            "phrase": phrase,
            "frames": len(frames),
            "left_frames": left,
            "right_frames": right,
            "two_hand_frames": both,
            "presence_transitions": transitions,
            "flag_counts": "; ".join(f"{k} x{v}" for k, v in sorted(flags.items())),
            "flagged_frame_numbers": " ".join(str(n) for n in sorted(set(flagged_frames))),
        })
    with open(REPORTS / "per_class_frame_summary.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(summary[0].keys()))
        writer.writeheader()
        writer.writerows(summary)
    for row in summary:
        print(f"{row['phrase']:16s} L{row['left_frames']:3d} R{row['right_frames']:3d} both{row['two_hand_frames']:3d} "
              f"trans{row['presence_transitions']:3d} | {row['flag_counts']}")
    print(f"wrote {REPORTS / 'frame_diagnostics.csv'} ({len(all_frames)} frames)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
