"""Stage 2: Dynamic Time Warping baseline over 32-frame windows. Internal diagnostics only.

WITHIN-CLIP AND NON-INDEPENDENT. Each dynamic phrase has one assumed clip. Windows from the same clip overlap, and
leave-one-clip-out is impossible: the only correct match is removed from the reference set. So this module reports
nearest-clip structure, distances and rejection behaviour. It does NOT report accuracy.

Distance: per-frame Euclidean cost on the 141-value frame vector (the existing temporal features split per frame),
classic DTW with no band, normalised by (T + S) = 64 for two 32-frame windows.

Rejection rule (fixed before looking at out-of-set data):
  t = 95th percentile of each in-set window's distance to its nearest window of a DIFFERENT clip.
  A query is REJECTED if its nearest distance > t.
  A query is AMBIGUOUS if the nearest different-clip distance is less than AMBIGUITY_RATIO times the next different-clip
  distance (the nearest clip's distance is not clearly better than the runner-up).
  Otherwise ACCEPTED with the nearest clip's phrase.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\dynamic\\evaluate_dtw.py [--overwrite]
"""

import argparse
import csv
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import prepare_sequences as prep  # noqa: E402

REPO = prep.REPO
CANDIDATE = REPO / "ai-engine" / "models" / "phrase_candidates" / "dynamic_v1"
REPORTS = HERE / "reports"
AMBIGUITY_RATIO = 1.05
THRESHOLD_PERCENTILE = 95
CHUNK = 32
DISTANCE_DESCRIPTION = (
    "Classic DTW, no band. Local cost = Euclidean distance between 141-value per-frame vectors. Total cost divided "
    "by (T + S) = 64 for two 32-frame windows, so distances are comparable across pairs of equal length."
)


def dtw_from_cost(cost: np.ndarray) -> np.ndarray:
    """cost: (R, T, T). Returns (R,) normalised DTW distances. Vectorised over the R references."""
    r, T, S = cost.shape
    D = np.full((r, T + 1, S + 1), np.inf)
    D[:, 0, 0] = 0.0
    for i in range(1, T + 1):
        for j in range(1, S + 1):
            D[:, i, j] = cost[:, i - 1, j - 1] + np.minimum(np.minimum(D[:, i - 1, j], D[:, i, j - 1]), D[:, i - 1, j - 1])
    return D[:, T, S] / (T + S)


def dtw_to_bank(query: np.ndarray, bank: np.ndarray) -> np.ndarray:
    out = np.empty(len(bank))
    for start in range(0, len(bank), CHUNK):
        block = bank[start:start + CHUNK]
        cost = np.sqrt(((block[:, :, None, :] - query[None, None, :, :]) ** 2).sum(-1))
        out[start:start + CHUNK] = dtw_from_cost(cost)
    return out


def dtw_naive(a: np.ndarray, b: np.ndarray) -> float:
    """Reference implementation for tests. Same normalisation as the vectorised version."""
    T, S = len(a), len(b)
    D = np.full((T + 1, S + 1), np.inf)
    D[0, 0] = 0.0
    for i in range(1, T + 1):
        for j in range(1, S + 1):
            cost = float(np.linalg.norm(a[i - 1] - b[j - 1]))
            D[i, j] = cost + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    return float(D[T, S] / (T + S))


def pairwise(bank: np.ndarray) -> np.ndarray:
    return np.stack([dtw_to_bank(bank[i], bank) for i in range(len(bank))])


def stack(items: list[dict]) -> np.ndarray:
    return np.stack([i["per_frame"] for i in items]).astype(np.float64)


def assess(query_distances: np.ndarray, query_labels: list[str], bank_labels: np.ndarray, threshold: float) -> list[dict]:
    """Nearest-clip prediction, distances, ambiguity and rejection for each query.

    The nearest clip is the clip of the closest reference window. The runner-up is the closest window of any other
    clip. Windows of the same clip as the query are excluded by the caller, not here.
    """
    results = []
    for q, row in enumerate(query_distances):
        order = np.argsort(row)
        best = int(order[0])
        best_label = bank_labels[best]
        second = next((int(k) for k in order[1:] if bank_labels[k] != best_label), None)
        second_distance = float(row[second]) if second is not None else float("inf")
        ratio = second_distance / max(float(row[best]), 1e-12)
        if row[best] > threshold:
            status = "rejected"
        elif ratio < AMBIGUITY_RATIO:
            status = "ambiguous"
        else:
            status = "accepted"
        results.append({
            "query_phrase": query_labels[q],
            "predicted_phrase": best_label,
            "nearest_distance": float(row[best]),
            "runner_up_distance": second_distance,
            "ratio": float(ratio),
            "status": status,
        })
    return results


def nearest_other_distances(D: np.ndarray, labels: np.ndarray) -> np.ndarray:
    masked = np.where(labels[:, None] == labels[None, :], np.inf, D)
    return masked.min(axis=1)


def summarise(values) -> dict:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return {"n": 0}
    return {"n": int(arr.size), "min": float(arr.min()), "p05": float(np.percentile(arr, 5)),
            "median": float(np.median(arr)), "p95": float(np.percentile(arr, 95)), "max": float(arr.max())}


def run() -> dict:
    groups = prep.build_all({
        "dynamic": prep.dynamic_phrases(prep.read_manifest()),
        "undetermined": prep.UNDETERMINED,
        "static": prep.STATIC_ALL,
    })
    eligible = [i for i in groups["dynamic"] if i["eligible"]]
    bank = stack(eligible)
    labels = np.array([i["phrase"] for i in eligible])
    D = pairwise(bank)
    again = pairwise(bank)
    reproducible = bool(np.array_equal(D, again))

    nearest_other = nearest_other_distances(D, labels)
    threshold = float(np.percentile(nearest_other, THRESHOLD_PERCENTILE))

    intra = []
    for i in range(len(labels)):
        same = np.where((labels == labels[i]) & (np.arange(len(labels)) != i))[0]
        intra.append(float(D[i, same].min()))

    phrases = sorted(set(labels))
    D_no_self = D + np.diag(np.full(len(labels), np.inf))
    clip_matrix = np.zeros((len(phrases), len(phrases)))
    for a, pa in enumerate(phrases):
        for b, pb in enumerate(phrases):
            clip_matrix[a, b] = D_no_self[np.ix_(labels == pa, labels == pb)].min()

    in_set = []
    for i in range(len(labels)):
        row = D[i].copy()
        row[labels == labels[i]] = np.inf
        in_set.append(row)
    in_set = np.stack(in_set)
    in_set_results = assess(in_set, list(labels), labels, threshold)

    probes = {}
    for group in ("undetermined", "static"):
        items = [i for i in groups[group]]
        probe_bank = bank
        matrix = np.stack([dtw_to_bank(stack([i])[0], probe_bank) for i in items])
        probes[group] = {
            "items": items,
            "results": assess(matrix, [i["phrase"] for i in items], labels, threshold),
        }

    hand_share = np.array([i["hand_frame_share"] for i in eligible])
    nearest_by_hand = {}
    for name, mask in (("<0.80", hand_share < 0.8), ("0.80-0.95", (hand_share >= 0.8) & (hand_share < 0.95)),
                       (">=0.95", hand_share >= 0.95)):
        nearest_by_hand[name] = summarise(nearest_other[mask]) if mask.any() else {"n": 0}

    return {
        "bank": bank, "labels": labels, "eligible": eligible, "D": D, "reproducible": reproducible,
        "nearest_other": nearest_other, "threshold": threshold, "intra": np.array(intra),
        "clip_matrix": clip_matrix, "phrases": phrases, "in_set_results": in_set_results,
        "probes": probes, "hand_share": hand_share, "nearest_by_hand": nearest_by_hand,
        "groups": groups,
    }


def counts(results: list[dict]) -> dict:
    total = len(results)
    out = {"n": total}
    for status in ("accepted", "ambiguous", "rejected"):
        out[status] = sum(r["status"] == status for r in results)
        out[f"{status}_rate"] = round(out[status] / total, 3) if total else 0.0
    return out


def write_reports(state: dict) -> dict:
    REPORTS.mkdir(parents=True, exist_ok=True)
    rows = []
    for r in state["in_set_results"]:
        rows.append({"group": "dynamic_in_set", **r})
    for group, probe in state["probes"].items():
        for r in probe["results"]:
            rows.append({"group": f"{group}_out_of_set", **r})
    with open(REPORTS / "nearest_neighbour_predictions.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    phrases = state["phrases"]
    with open(REPORTS / "clip_distance_matrix.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([""] + phrases)
        for a, pa in enumerate(phrases):
            writer.writerow([pa] + [f"{v:.4f}" for v in state["clip_matrix"][a]])

    summary = {
        "in_set": counts(state["in_set_results"]),
        "undetermined_out_of_set": counts(state["probes"]["undetermined"]["results"]),
        "static_out_of_set": counts(state["probes"]["static"]["results"]),
        "threshold": state["threshold"],
        "threshold_rule": f"{THRESHOLD_PERCENTILE}th percentile of in-set nearest different-clip distance",
        "ambiguity_ratio": AMBIGUITY_RATIO,
        "nearest_other_clip_distance": summarise(state["nearest_other"]),
        "undetermined_nearest_distance": summarise([r["nearest_distance"] for r in state["probes"]["undetermined"]["results"]]),
        "static_nearest_distance": summarise([r["nearest_distance"] for r in state["probes"]["static"]["results"]]),
        "same_clip_overlap_distance": summarise(state["intra"]),
        "by_hand_share": state["nearest_by_hand"],
        "reproducible_distance_matrix": state["reproducible"],
    }
    lines = [
        "# DTW baseline (Stage 2): internal diagnostics", "",
        "> **Within-clip and NOT independent.** One assumed clip per phrase. Overlapping windows of one clip are",
        "> not independent samples. These numbers describe nearest-clip structure and rejection behaviour only.",
        "> They are not accuracy and not real-world recognition performance.", "",
        f"Distance: {DISTANCE_DESCRIPTION}", "",
        f"Reference windows: {len(state['labels'])} (28 clips x 9 windows, all eligible).",
        f"Reproducible distance matrix across two runs: {state['reproducible']}.", "",
        "## Threshold", "",
        f"- Rule: {summary['threshold_rule']}. Value: {state['threshold']:.4f}.",
        f"- Ambiguity: nearest different-clip distance must be at least {AMBIGUITY_RATIO} x the runner-up.",
        "- The threshold is taken from this dataset's own geometry. It is not validated on new recordings.", "",
        "## Distances", "",
        f"- Nearest different-clip distance (in-set): {json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in summary['nearest_other_clip_distance'].items()})}",
        f"- Same-clip overlapping window distance (non-independent, pipeline check only): "
        f"{json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in summary['same_clip_overlap_distance'].items()})}",
        f"- Undetermined probes, nearest distance to the dynamic bank: "
        f"{json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in summary['undetermined_nearest_distance'].items()})}",
        f"- Static probes (train and held), nearest distance to the dynamic bank: "
        f"{json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in summary['static_nearest_distance'].items()})}",
        "", "The rejection threshold is set by in-set distances only, so out-of-set probes that sit inside the in-set range",
        "are not rejected. This is the main limitation of the rule, not a tuning opportunity: changing the threshold to reject",
        "more probes would also reject in-set windows, and no independent data exists to choose between them.", "",
        "## Decisions (counts)", "",
        "| Group | n | Accepted | Ambiguous | Rejected |", "| --- | ---: | ---: | ---: | ---: |",
    ]
    for label, key in (("Dynamic in-set (other-clip reference)", "in_set"),
                       ("Undetermined out-of-set", "undetermined_out_of_set"),
                       ("Static out-of-set (train and held)", "static_out_of_set")):
        c = summary[key]
        lines.append(f"| {label} | {c['n']} | {c['accepted']} ({c['accepted_rate']}) | {c['ambiguous']} ({c['ambiguous_rate']}) | {c['rejected']} ({c['rejected_rate']}) |")
    lines += ["", "In-set acceptance is not a success rate: the reference set is built to contain other phrases only,",
              "so a query cannot be correct. These counts show how often the rule keeps a window at all.", "",
              "## Missing-hand effect (nearest different-clip distance by hand share)", "",
              "| Hand share | n | Median | p95 |", "| --- | ---: | ---: | ---: |"]
    for name, s in state["nearest_by_hand"].items():
        if s.get("n"):
            lines.append(f"| {name} | {s['n']} | {s['median']:.4f} | {s['p95']:.4f} |")
    lines += ["", "## Clip-to-clip nearest distance (min over windows)", "",
              "Lower values mean two phrases look more alike under this distance. The diagonal is the overlap of a clip with itself.", "",
              "See clip_distance_matrix.csv for the full 28 x 28 table.", "",
              "## Limitations", "",
              "- One recording per phrase: no independent evaluation is possible.",
              "- Overlapping windows are not independent samples.",
              "- Frame rate unknown: DTW compares frame index order, not real timing.",
              "- Presence effects: classes with no two-hand frames are compared with zero-filled second-hand blocks.",
              "- 'open' is included (manifest dynamic class) although it was not in the approved 27-name list; its hand-size outliers are kept, not removed.",
              "- Single-hand and hand-size outliers were not removed; see dynamic_sequence_quality.md.",
              "- Live serving samples camera frames in VIDEO mode at a different rate; these training windows came from IMAGE-mode stills.", ""]
    (REPORTS / "dtw_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (REPORTS / "dtw_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def write_candidate(state: dict, summary: dict, overwrite: bool) -> None:
    if CANDIDATE.exists() and not overwrite:
        raise SystemExit(f"{CANDIDATE} exists. Use --overwrite.")
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    frames = state["bank"].astype(np.float32)
    np.savez(
        CANDIDATE / "reference_bank.npz",
        per_frame=frames,
        labels=state["labels"].astype(str),
        frame_numbers=np.array([i["frame_numbers"] for i in state["eligible"]]),
        start=np.array([i["start"] for i in state["eligible"]]),
        hand_frame_share=state["hand_share"],
    )
    config = {
        "candidate": "dynamic_v1",
        "status": "not_activated",
        "experimental": True,
        "verification": "unverified_dataset",
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "classes": sorted(set(state["labels"].tolist())),
        "held_out_of_set_groups": ["undetermined (careful, chat, hungry, stop, write)", "static (not dynamic classes)"],
        "window_frames": prep.WINDOW,
        "stride": prep.STRIDE,
        "frame_rate": "unknown; windows use frame index only",
        "feature_source": "signbridge_training/features.py::features (imported, not copied), split per frame into 141 values",
        "per_frame_layout": "shape 126 | trajectory 6 | velocity 6 | relative hands 3",
        "distance": DISTANCE_DESCRIPTION,
        "threshold": state["threshold"],
        "threshold_rule": summary["threshold_rule"],
        "ambiguity_ratio": AMBIGUITY_RATIO,
        "reference_windows": int(len(state["labels"])),
        "input_sha256": {
            "phrase_manifest": hashlib.sha256((prep.MANIFEST).read_bytes()).hexdigest(),
            "landmarks": hashlib.sha256((prep.LANDMARKS).read_bytes()).hexdigest(),
        },
        "validation": "within-clip only, non-independent; no accuracy claim",
        "limitations": [
            "One recording per phrase; no independent evaluation.",
            "Overlapping windows are not independent.",
            "Frame rate unknown.",
            "Not a trained model: the reference bank plus DTW is the whole prototype.",
            "Not loadable by the live recognizer; live integration requires separate approval.",
            "IMAGE-mode stills for training, VIDEO-mode camera frames at serving time.",
        ],
    }
    (CANDIDATE / "dtw_config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    card = "\n".join([
        "# Model card: dynamic_v1 DTW prototype (experimental, NOT activated)", "",
        "**Status: EXPERIMENTAL / UNVERIFIED. Research use only. Not a verified ISL translation. Not activated.**", "",
        "This is a reference bank of 32-frame windows plus a DTW distance and a rejection rule. There is no trained",
        "model file. It cannot be loaded by the live recognizer.", "",
        "## Validation", "",
        "Within-clip only and NOT independent. One recording per phrase. Overlapping windows are not independent samples.",
        "No accuracy is claimed. See `reports/dtw_report.md` in `ai-engine/training/phrase_experiments/dynamic/`.", "",
        "## Limitations", "",
        *[f"- {item}" for item in config["limitations"]], "",
        "## Citation and licence", "",
        "Dataset for everyday phrases and words in Indian sign language. Source: 'images for phrases.zip' (licence",
        "unknown; do not redistribute).", "",
    ])
    (CANDIDATE / "model_card.md").write_text(card, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    state = run()
    summary = write_reports(state)
    write_candidate(state, summary, args.overwrite)
    print(f"reference windows {len(state['labels'])} | threshold {state['threshold']:.4f} | reproducible {state['reproducible']}")
    print(f"in-set {summary['in_set']}")
    print(f"undetermined out-of-set {summary['undetermined_out_of_set']}")
    print(f"static out-of-set {summary['static_out_of_set']}")
    print(f"wrote {REPORTS} and {CANDIDATE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
