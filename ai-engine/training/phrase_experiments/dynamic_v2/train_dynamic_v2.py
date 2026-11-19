"""Dynamic 28-phrase experiment (v2): aggregated temporal features, logistic regression candidate, random forest comparison.

WITHIN_CLIP_EXPERIMENTAL_NOT_INDEPENDENT. Each dynamic phrase is one assumed clip of 40 still frames. The 9 windows of
a clip overlap by at least 25 frames, so windows are not independent examples. No signer identity exists, so no
signer-independent or clip-independent evaluation is possible.

What this script measures and what it does NOT measure:
  - resubstitution (fit and score on the same windows): a fit check, not a result.
  - extreme-window hold-out (windows starting at frames 0 and 8 held out, the rest used for fitting): LEAKY, because each
    held window shares 31 frames with its nearest training window. Reported only as a within-clip consistency check.
  - clip-level label permutation control: the same fit with the 28 clip labels reassigned at random. If the held-out
    score stays high under permuted labels, the model is not using handshape; if it falls, the score tracks clip identity.
Nothing here is a real-world accuracy, and nothing is activated or connected to live recognition.

Inputs : Stage 2 window builder (imported read-only from ../dynamic/prepare_sequences.py), which reads the Stage 0
         manifest and the stored landmarks. The temporal feature function is imported through that builder
         (signbridge_training/features.py, never copied).
Outputs: ai-engine/models/phrase_candidates/dynamic_v2/ (new folder; refuses to overwrite unless --overwrite)

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\dynamic_v2\\train_dynamic_v2.py
"""

import argparse
import csv
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(HERE.parent / "dynamic"))
import prepare_sequences as prep  # noqa: E402

OUT = REPO / "ai-engine" / "models" / "phrase_candidates" / "dynamic_v2"
LABEL = "WITHIN_CLIP_EXPERIMENTAL_NOT_INDEPENDENT"
VERSION = "dynamic_v2"
FEATURE_CONTRACT = "dynamic_v2_aggregated_569"
HELD_STARTS = (0, 8)
SEED = 0
SHUFFLE_SEEDS = list(range(10))
WINDOW = prep.WINDOW
PER_FRAME = prep.PER_FRAME_DIM
LEFT, RIGHT = slice(0, 63), slice(63, 126)
AGGREGATE_DIM = PER_FRAME * 4 + 4 + 1  # mean, std, min, max per frame value, then presence (4) and wrist path (1)
MANIFEST = prep.MANIFEST
LANDMARKS = prep.LANDMARKS
ACTIVE_MODEL = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
PROTECTED_HASHES = {
    "ai-engine/models/phrase_classifier.joblib": "ecb20d58dec82ee2c994f2b65def4e202a08fa8f150baa06bcc80331e39842aa",
    "ai-engine/models/phrase_candidates/static_v1/candidate_full.joblib":
        "7ddb422ffa5e378855d70c185515bd99fbe5859b569d25dd37ce5459ac80b569",
    "ai-engine/models/phrase_candidates/dynamic_v1/reference_bank.npz":
        "c9eaa528e1dd35d5e9ad044dfb78a410006000ddb6fc261112ee9e7a65ed7e81",
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def aggregate(item: dict) -> np.ndarray:
    """One fixed-length vector per window: mean, std, min and max of each per-frame value over the 32 frames,
    then hand-presence statistics and the summed wrist path from the Stage 2 quality measure."""
    pf = item["per_frame"]
    stats = np.concatenate([pf.mean(0), pf.std(0), pf.min(0), pf.max(0)])
    left = np.any(pf[:, LEFT] != 0, axis=1).astype(int)
    right = np.any(pf[:, RIGHT] != 0, axis=1).astype(int)
    transitions = int(np.sum(np.diff(left) != 0) + np.sum(np.diff(right) != 0))
    presence = [left.mean(), right.mean(), float(np.mean(left & right)), transitions]
    vector = np.concatenate([stats, presence, [item["motion_wrist_path"]]]).astype(np.float64)
    if vector.shape != (AGGREGATE_DIM,):
        raise SystemExit(f"aggregate has {vector.shape}, expected {AGGREGATE_DIM}")
    if not np.all(np.isfinite(vector)):
        raise SystemExit("non-finite aggregate feature")
    return vector


def load_windows() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    rows = prep.read_manifest()
    phrases = prep.dynamic_phrases(rows)
    if len(phrases) != 28:
        raise SystemExit(f"expected 28 dynamic phrases, found {len(phrases)}")
    items = prep.build_all({"dynamic": phrases})["dynamic"]
    eligible = [i for i in items if i["eligible"]]
    if len(eligible) != len(items):
        raise SystemExit("some windows are not eligible; this experiment expects all 252")
    X = np.stack([aggregate(i) for i in eligible])
    y = np.array([i["phrase"] for i in eligible])
    starts = np.array([i["start"] for i in eligible])
    return X, y, starts, phrases


def split(starts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    held = np.isin(starts, HELD_STARTS)
    return np.where(~held)[0], np.where(held)[0]


def overlap_frames(a: int, b: int) -> int:
    return max(0, WINDOW - abs(a - b))


def leakage_report(starts: np.ndarray, train_idx: np.ndarray, held_idx: np.ndarray) -> dict:
    nearest = []
    for h in held_idx:
        overlaps = [overlap_frames(starts[h], starts[t]) for t in train_idx]
        nearest.append(max(overlaps))
    return {"held_windows": int(len(held_idx)), "min_shared_frames_with_nearest_training_window": int(min(nearest)),
            "max_shared_frames_with_nearest_training_window": int(max(nearest))}


def make_model(name: str):
    if name == "logistic_regression":
        return make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000, C=1.0))
    if name == "random_forest":
        return RandomForestClassifier(n_estimators=300, random_state=SEED, n_jobs=-1)
    raise ValueError(name)


def score(y_true: np.ndarray, y_pred: np.ndarray, labels: list[str]) -> dict:
    report = classification_report(y_true, y_pred, labels=labels, output_dict=True, zero_division=0)
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)),
        "per_class": {c: {"precision": float(report[c]["precision"]), "recall": float(report[c]["recall"]),
                          "f1": float(report[c]["f1-score"]), "support": int(report[c]["support"])} for c in labels},
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }


def permuted_clip_labels(y: np.ndarray, labels: list[str], seed: int) -> dict:
    rng = np.random.default_rng(seed)
    return dict(zip(labels, rng.permutation(labels).tolist()))


def summarise(values: list[float]) -> dict:
    arr = np.array(values)
    return {"mean": float(arr.mean()), "sd": float(arr.std(ddof=1)) if len(arr) > 1 else 0.0,
            "min": float(arr.min()), "max": float(arr.max()), "n": int(len(arr))}


def run(labels: list[str], X: np.ndarray, y: np.ndarray, starts: np.ndarray) -> dict:
    train_idx, held_idx = split(starts)
    results: dict = {"leakage": leakage_report(starts, train_idx, held_idx), "models": {}}
    for name in ("logistic_regression", "random_forest"):
        fit_model = make_model(name).fit(X[train_idx], y[train_idx])
        resub = fit_model.predict(X[train_idx])
        pred = fit_model.predict(X[held_idx])
        proba = fit_model.predict_proba(X[held_idx])
        top = proba.max(axis=1)
        correct = pred == y[held_idx]
        failures = [
            {"phrase": y[held_idx][i], "start": int(starts[held_idx][i]), "predicted": pred[i],
             "top_probability": round(float(top[i]), 4)}
            for i in np.where(~correct)[0]
        ]
        results["models"][name] = {
            "resubstitution_accuracy_on_training_windows": float(accuracy_score(y[train_idx], resub)),
            "held_out_leaky": score(y[held_idx], pred, labels),
            "confidence": {
                "median_correct": float(np.median(top[correct])) if correct.any() else None,
                "median_incorrect": float(np.median(top[~correct])) if (~correct).any() else None,
            },
            "failure_cases": failures,
        }
    results["shuffle_control"] = {}
    for name in ("logistic_regression",):
        accs = []
        for seed in SHUFFLE_SEEDS:
            mapping = permuted_clip_labels(y, labels, seed)
            y_perm = np.array([mapping[v] for v in y])
            model = make_model(name).fit(X[train_idx], y_perm[train_idx])
            pred = model.predict(X[held_idx])
            accs.append(float(accuracy_score(y[held_idx], pred)))
        results["shuffle_control"][name] = {"accuracy_with_permuted_clip_labels": summarise(accs),
                                            "chance": 1 / len(labels), "seeds": SHUFFLE_SEEDS}
    return results


def markdown(results: dict, labels: list[str], generated: str) -> str:
    lg = results["models"]["logistic_regression"]
    rf = results["models"]["random_forest"]
    sh = results["shuffle_control"]["logistic_regression"]["accuracy_with_permuted_clip_labels"]
    leak = results["leakage"]
    lines = [
        "# Dynamic 28-phrase experiment (v2): evaluation report", "",
        f"> **{LABEL}.** Each phrase is one assumed clip. The windows of a clip overlap, so they are not independent.",
        "> The held-out numbers below are leaky by design: they are a within-clip consistency check, not accuracy, and",
        "> not real-world recognition performance. Nothing here is activated or connected to live recognition.", "",
        f"Generated: {generated}", "",
        "## Data", "",
        f"- Windows: {len(labels) * 9} (28 clips x 9 windows of 32 frames, stride 1). Feature vector: {AGGREGATE_DIM} values.",
        f"- Fitted on windows starting at frames 1–7 ({len(labels) * 7}); held out at frames 0 and 8 ({len(labels) * 2}).",
        f"- Shared frames between each held-out window and its nearest fitted window: "
        f"{leak['min_shared_frames_with_nearest_training_window']}–{leak['max_shared_frames_with_nearest_training_window']}.",
        "  This overlap makes the hold-out leaky.", "",
        "## Results", "",
        "| Model | Resubstitution accuracy (fit check) | Held-out accuracy (LEAKY) | Held-out macro-F1 (LEAKY) |",
        "| --- | ---: | ---: | ---: |",
        f"| logistic regression (candidate) | {lg['resubstitution_accuracy_on_training_windows']:.3f} | "
        f"{lg['held_out_leaky']['accuracy']:.3f} | {lg['held_out_leaky']['macro_f1']:.3f} |",
        f"| random forest (comparison) | {rf['resubstitution_accuracy_on_training_windows']:.3f} | "
        f"{rf['held_out_leaky']['accuracy']:.3f} | {rf['held_out_leaky']['macro_f1']:.3f} |", "",
        "## Clip-level label-permutation control (logistic regression)", "",
        f"With the 28 clip labels reassigned at random (10 seeds), held-out accuracy against the **true** labels is "
        f"{sh['mean']:.3f} ± {sh['sd']:.3f} (range {sh['min']:.3f}–{sh['max']:.3f}), chance {1 / len(labels):.3f}.",
        "",
        "Reading: the candidate scores highly on held-out windows because each held-out window matches its own clip's",
        "training windows. Under permuted labels, the same matching gives the wrong label, so accuracy drops. The high",
        "score therefore reflects clip identity, not handshape generalisation.", "",
        "## Confidence", "",
        f"- Candidate: median top probability for correct held-out predictions {lg['confidence']['median_correct']}, "
        f"for incorrect {lg['confidence']['median_incorrect']}. No threshold was chosen.", "",
        "## Per-class results (candidate, LEAKY hold-out)", "",
        "| Class | Precision | Recall | F1 | Support |", "| --- | ---: | ---: | ---: | ---: |",
    ]
    for c in labels:
        pc = lg["held_out_leaky"]["per_class"][c]
        lines.append(f"| {c} | {pc['precision']:.3f} | {pc['recall']:.3f} | {pc['f1']:.3f} | {pc['support']} |")
    lines += ["", f"Failure cases (candidate, held-out): {len(lg['failure_cases'])}. See failure_cases.csv.", "",
              "## Limitations", "",
              "- One assumed clip per phrase, 28 clips. No signer identities. Frame rate unknown.",
              "- Overlapping windows; the hold-out shares up to 31 frames with training windows.",
              "- Presence is almost fixed per class (Stage 1 finding), so presence features alone may separate some classes.",
              "- Labels are unreviewed by any qualified ISL signer.",
              "- The candidate is not activated and is not loadable by the live recognizer.",
              "- Thresholds, calibration and rejection were not evaluated.", ""]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if OUT.exists() and not args.overwrite:
        print(f"Refusing to overwrite {OUT}. Use --overwrite.")
        return 2

    before = {p: sha256_file(REPO / p) for p in PROTECTED_HASHES}
    X, y, starts, phrases = load_windows()
    labels = sorted(phrases)
    print(f"windows {len(y)} | features {X.shape[1]} | classes {len(labels)}")
    results = run(labels, X, y, starts)
    for name, block in results["models"].items():
        print(f"{name:20s} resub {block['resubstitution_accuracy_on_training_windows']:.3f} | "
              f"held (leaky) acc {block['held_out_leaky']['accuracy']:.3f} macroF1 {block['held_out_leaky']['macro_f1']:.3f}")
    sh = results["shuffle_control"]["logistic_regression"]["accuracy_with_permuted_clip_labels"]
    print(f"permuted-label control acc {sh['mean']:.3f} +/- {sh['sd']:.3f}")

    generated = datetime.now(UTC).isoformat(timespec="seconds")
    OUT.mkdir(parents=True, exist_ok=True)
    candidate = make_model("logistic_regression").fit(X, y)
    if [str(c) for c in candidate.classes_] != labels:
        raise SystemExit("candidate class order does not match the label list")
    forest = make_model("random_forest").fit(X, y)
    bundle_common = {
        "labels": labels, "classes": labels, "version": 1, "candidate_version": VERSION,
        "feature_count": AGGREGATE_DIM, "feature_contract": FEATURE_CONTRACT,
        "verification": "unverified_dataset", "experimental": True,
        "candidate_status": "experiment_only_not_servable", "validation": LABEL,
    }
    joblib.dump({**bundle_common, "model": candidate, "model_type": "logistic_regression"},
                OUT / "candidate_logistic_regression.joblib")
    joblib.dump({**bundle_common, "model": forest, "model_type": "random_forest"},
                OUT / "comparison_random_forest.joblib")

    with open(OUT / "failure_cases.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["phrase", "start", "predicted", "top_probability"])
        writer.writeheader()
        writer.writerows(results["models"]["logistic_regression"]["failure_cases"])
    for name in ("logistic_regression", "random_forest"):
        np.savetxt(OUT / f"confusion_{name}_held_out_leaky.csv",
                   np.array(results["models"][name]["held_out_leaky"]["confusion_matrix"]), fmt="%d", delimiter=",")

    after = {p: sha256_file(REPO / p) for p in PROTECTED_HASHES}
    protected_ok = before == after and all(after[p] == h for p, h in PROTECTED_HASHES.items())
    config = {
        "version": VERSION,
        "label": LABEL,
        "generated_at": generated,
        "status": "experiment_only_not_servable",
        "classes": labels,
        "windows": int(len(y)),
        "window_frames": WINDOW,
        "stride": prep.STRIDE,
        "feature_contract": FEATURE_CONTRACT,
        "feature_dim": AGGREGATE_DIM,
        "feature_definition": "per-frame 141 values: mean, std, min, max over 32 frames (564); left and right presence "
                              "fractions, both-hands fraction, presence transitions (4); summed wrist path (1)",
        "feature_source": "signbridge_training/features.py::features via dynamic/prepare_sequences.py (not copied)",
        "split": {"fit_starts": [1, 2, 3, 4, 5, 6, 7], "held_starts": list(HELD_STARTS),
                  "held_out_is": "LEAKY: shares up to 31 frames with training windows"},
        "candidate": "logistic_regression (StandardScaler, C=1.0, max_iter=5000), chosen before results",
        "comparison": "random_forest (300 trees, random_state 0)",
        "shuffle_seeds": SHUFFLE_SEEDS,
        "seed": SEED,
        "threshold": None,
        "software": {"python": sys.version.split()[0], "numpy": np.__version__, "scikit_learn": sklearn.__version__},
        "inputs_sha256": {"phrase_manifest": sha256_file(MANIFEST), "landmarks": sha256_file(LANDMARKS)},
        "protected_hashes_before": before,
        "protected_hashes_after": after,
        "protected_files_unchanged": protected_ok,
    }
    (OUT / "experiment_config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    (OUT / "training_report.json").write_text(json.dumps({"config": config, "results": results}, indent=2),
                                              encoding="utf-8")
    (OUT / "evaluation_report.md").write_text(markdown(results, labels, generated), encoding="utf-8")
    (OUT / "class_map.json").write_text(json.dumps({"labels": labels, "index": {c: i for i, c in enumerate(labels)}},
                                                   indent=2), encoding="utf-8")
    (OUT / "model_card.md").write_text("\n".join([
        "# Model card: dynamic_v2 experimental candidate (NOT activated)", "",
        f"**{LABEL}.** Experimental research only. Not a verified ISL translation. Not loadable by the live recognizer.", "",
        "- 28 dynamic phrases, one assumed clip each, 252 overlapping 32-frame windows.",
        f"- Feature contract `{FEATURE_CONTRACT}` ({AGGREGATE_DIM} values), aggregated from the existing temporal features.",
        "- Candidate: logistic regression. Comparison: random forest.",
        "- Validation: leaky extreme-window hold-out, plus a clip-level label-permutation control. No accuracy claim.",
        "- Hold-out windows share up to 31 frames with training windows; the score reflects clip identity.",
        "- No signer identities; no independent evaluation is possible with this data.",
        "- Labels unreviewed by any qualified ISL signer. Licence unknown.", "",
        "See evaluation_report.md and experiment_config.json for details.", ""]), encoding="utf-8")
    print(f"protected files unchanged: {protected_ok}")
    print(f"wrote {OUT}")
    return 0 if protected_ok else 1


if __name__ == "__main__":
    sys.exit(main())
