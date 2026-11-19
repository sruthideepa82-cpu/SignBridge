"""Stage 3 Workstream C: how well does simple motion energy separate dynamic windows from static and undetermined ones?

CIRCULARITY WARNING: the dynamic / static labels come from a wrist-travel and handshape rule applied to this same
dataset (phrase_inventory.csv). Any separation on motion is partly built in. This is a consistency check, not evidence
of generalisation.

Read-only. Reuses the Stage 2 window builder (imported, not copied). Writes reports/motion_separation.md and json.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\stage3\\motion_separation.py
"""

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
STAGE2 = HERE.parent / "dynamic"
sys.path.insert(0, str(STAGE2))
import prepare_sequences as prep  # noqa: E402

REPORTS = HERE / "reports"


def auc(positive: np.ndarray, negative: np.ndarray) -> float:
    """Probability that a random positive scores higher than a random negative (ties count half)."""
    wins = 0.0
    for p in positive:
        wins += float(np.sum(p > negative)) + 0.5 * float(np.sum(p == negative))
    return wins / (len(positive) * len(negative))


def summary(values: np.ndarray) -> dict:
    return {"n": int(len(values)), "min": float(values.min()), "p05": float(np.percentile(values, 5)),
            "median": float(np.median(values)), "p95": float(np.percentile(values, 95)), "max": float(values.max())}


def main() -> int:
    rows = prep.read_manifest()
    dynamic = prep.dynamic_phrases(rows)
    groups = prep.build_all({
        "dynamic": dynamic,
        "static": prep.STATIC_ALL,
        "undetermined": prep.UNDETERMINED,
    })

    def motion(items: list[dict]) -> np.ndarray:
        return np.array([i["motion_wrist_path"] for i in items if i["eligible"]])

    dyn = motion(groups["dynamic"])
    static = motion(groups["static"])
    undet = motion(groups["undetermined"])
    result = {
        "caveat": "dynamic and static labels were defined from the same motion rule; separation is partly circular",
        "wrist_path_per_window": {"dynamic": summary(dyn), "static": summary(static), "undetermined": summary(undet)},
        "auc_dynamic_vs_static": auc(dyn, static),
        "auc_dynamic_vs_undetermined": auc(dyn, undet),
        "static_windows_above_dynamic_median": float(np.mean(static > np.median(dyn))),
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "motion_separation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    lines = [
        "# Motion separation: dynamic vs static vs undetermined windows (Stage 3)", "",
        f"> {result['caveat']}.", "",
        "Measure: summed wrist path per window, in hand-size units, over both hands.", "",
        "| Group | n | Min | p05 | Median | p95 | Max |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for name, s in result["wrist_path_per_window"].items():
        lines.append(f"| {name} | {s['n']} | {s['min']:.3f} | {s['p05']:.3f} | {s['median']:.3f} | {s['p95']:.3f} | {s['max']:.3f} |")
    lines += ["", f"- AUC dynamic vs static: {result['auc_dynamic_vs_static']:.3f}",
              f"- AUC dynamic vs undetermined: {result['auc_dynamic_vs_undetermined']:.3f}",
              f"- Fraction of static windows above the dynamic median: {result['static_windows_above_dynamic_median']:.3f}", "",
              "Interpretation: an AUC near 1 means motion energy alone separates the groups in this data. Because the labels",
              "came from the same motion measure, a high AUC does not show that the model would separate new recordings.",
              "A value near 0.5 would mean motion energy does not separate the groups even on this data."]
    (REPORTS / "motion_separation.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "caveat"}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
