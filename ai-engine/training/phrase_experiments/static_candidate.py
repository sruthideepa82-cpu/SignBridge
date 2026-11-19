"""Stage 1: static phrase candidate (9 classes) with within-clip validation, presence ablation and a label-shuffle control.

Every validation score here is WITHIN-CLIP and NOT INDEPENDENT. Each class comes from one assumed clip, so these
numbers describe how well the pipeline runs on its own data. They are not real-world recognition accuracy.

Variants (all use the same 131-value feature function; the ablations exist only inside this experiment):
  full                      all 131 values
  presence_ablated          the two presence flags (columns 129, 130) set to 0 in training and evaluation
  presence_ablated_imputed  as above, and absent-hand blocks and wrist offsets replaced by training-fold means, so an
                            absent hand is no longer an all-zero block. Presence can still leak through the imputed
                            values; the decodability diagnostic measures how much.
  presence_only             the two presence flags only

Inputs : ai-engine/dataset/public/isl_phrases/v2/phrase_manifest.csv (eligible rows only)
         ai-engine/dataset/public/isl_phrases/landmarks.npz (stored IMAGE-mode landmarks, row index from the manifest)
Outputs: ai-engine/models/phrase_candidates/static_v1/ (refuses to overwrite unless --overwrite)
Never touches ai-engine/models/phrase_classifier.joblib, the alphabet model, shared services or protected files.

Usage (repo root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_experiments\\static_candidate.py
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
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend"))
from app.services.phrase_features import (  # noqa: E402
    PHRASE_FEATURE_CONTRACT,
    PHRASE_FEATURE_COUNT,
    build_phrase_features,
)

ISL = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
MANIFEST = ISL / "v2" / "phrase_manifest.csv"
SUMMARY = ISL / "v2" / "dataset_summary.json"
LANDMARKS = ISL / "landmarks.npz"
ACTIVE_MODEL = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
OUT = REPO / "ai-engine" / "models" / "phrase_candidates" / "static_v1"

DATASET_VERSION = "isl_phrases_v2_stage0"
CANDIDATE_VERSION = "static_v1"
STATIC_CLASSES = [
    "change", "happy birthday", "keepsmile", "mistake", "problem",
    "questions", "remember", "shift", "understand",
]
HELD_CLASSES = ["sick", "opinion"]
LEFT_BLOCK, RIGHT_BLOCK, OFFSET_BLOCK = slice(0, 63), slice(63, 126), slice(126, 129)
PRESENCE_COLUMNS = [129, 130]
WRIST_ZERO_COLUMNS = [0, 1, 2, 63, 64, 65]
N_BLOCKS = 4
GAP_FRAMES = 3
SHUFFLE_SEEDS = list(range(10))
ALGORITHMS = ("random_forest", "logistic_regression")
VARIANTS = ("full", "presence_ablated", "presence_ablated_imputed", "presence_only")
CITATION = (
    "Dataset for everyday phrases and words in Indian sign language. Source: 'images for phrases.zip' (no licence "
    "file in the archive; licence and citation unverified)."
)
VALIDATION_NOTE = (
    "Within-clip contiguous-block validation. Each class comes from one assumed clip, so validation is NOT "
    "independent. Scores are internal pipeline checks, not real-world recognition accuracy."
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_samples() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[dict]]:
    with open(MANIFEST, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    eligible = [r for r in rows if r["training_eligibility"] == "static_train_candidate"]
    if len(eligible) != 242:
        raise SystemExit(f"expected 242 eligible static frames, found {len(eligible)}")
    if {r["phrase_label"] for r in eligible} != set(STATIC_CLASSES):
        raise SystemExit("eligible classes do not match the approved static list")

    landmarks = np.load(LANDMARKS)["landmarks"]
    features, labels, frames, meta = [], [], [], []
    for r in eligible:
        index = int(r["landmarks_row"])
        raw = landmarks[index].astype(np.float64)
        present = ~np.isnan(landmarks[index, :, 0, 0])
        vector = build_phrase_features(np.nan_to_num(raw), present)
        if vector is None or vector.shape != (PHRASE_FEATURE_COUNT,) or not np.all(np.isfinite(vector)):
            raise SystemExit(f"invalid feature vector: {r['phrase_label']}/{r['source_file']}")
        features.append(vector)
        labels.append(r["phrase_label"])
        frames.append(int(r["frame_number"]))
        meta.append({"phrase": r["phrase_label"], "file": r["source_file"], "frame": int(r["frame_number"]),
                     "sha256": r["sha256"], "near_duplicate_group": r["near_duplicate_group"]})
    return np.stack(features), np.array(labels), np.array(frames), meta


def block_folds(y: np.ndarray, frames: np.ndarray, n_blocks: int = N_BLOCKS, gap: int = GAP_FRAMES) -> list[dict]:
    """Contiguous blocks in frame order, per class. Training frames within `gap` frames of a validation frame
    of the same class are dropped, so no training frame sits next to a validation frame."""
    per_fold_val: list[list[int]] = [[] for _ in range(n_blocks)]
    for label in sorted(set(y)):
        idx = np.where(y == label)[0]
        idx = idx[np.argsort(frames[idx], kind="stable")]
        for k, chunk in enumerate(np.array_split(idx, n_blocks)):
            per_fold_val[k].extend(chunk.tolist())
    folds = []
    for k in range(n_blocks):
        val = np.array(sorted(per_fold_val[k]))
        val_set = set(val.tolist())
        train, gap_excluded = [], 0
        for i in range(len(y)):
            if i in val_set:
                continue
            if any(y[v] == y[i] and abs(int(frames[i]) - int(frames[v])) <= gap for v in val):
                gap_excluded += 1
            else:
                train.append(i)
        train = np.array(train)
        for label in sorted(set(y)):
            if np.sum(y[train] == label) < 2:
                raise SystemExit(f"fold {k}: class {label} has fewer than 2 training frames")
        folds.append({"fold": k, "train": train, "val": val, "gap_excluded": gap_excluded})
    return folds


def imputation_means(X: np.ndarray, train_idx: np.ndarray) -> dict:
    """Training-only means used to fill absent hands in presence_ablated_imputed."""
    present_left = X[train_idx, 129] == 1
    present_right = X[train_idx, 130] == 1
    both = train_idx[present_left & present_right]
    return {
        "left": X[train_idx][present_left, LEFT_BLOCK].mean(0),
        "right": X[train_idx][present_right, RIGHT_BLOCK].mean(0),
        "offset": X[both, OFFSET_BLOCK].mean(0),
    }


def transform(X: np.ndarray, variant: str, train_idx: np.ndarray, means: dict | None = None) -> np.ndarray:
    """Variant matrix. Statistics come only from `train_idx` so validation rows never influence them."""
    if variant == "full":
        return X.copy()
    if variant == "presence_only":
        return X[:, PRESENCE_COLUMNS].copy()
    Z = X.copy()
    Z[:, PRESENCE_COLUMNS] = 0.0
    if variant == "presence_ablated":
        return Z
    if variant == "presence_ablated_imputed":
        if means is None:
            means = imputation_means(X, train_idx)
        left_missing = X[:, 129] == 0
        right_missing = X[:, 130] == 0
        Z[left_missing, LEFT_BLOCK] = means["left"]
        Z[right_missing, RIGHT_BLOCK] = means["right"]
        Z[left_missing | right_missing, OFFSET_BLOCK] = means["offset"]
        return Z
    raise ValueError(variant)


def make_model(algorithm: str, seed: int = 0):
    if algorithm == "random_forest":
        return RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1)
    if algorithm == "logistic_regression":
        return make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000))
    raise ValueError(algorithm)


def run_cv(X: np.ndarray, y: np.ndarray, folds: list[dict], algorithm: str, variant: str, seed: int = 0):
    out = np.empty(len(y), dtype=object)
    fold_scores = []
    for f in folds:
        Xf = transform(X, variant, f["train"])
        model = make_model(algorithm, seed).fit(Xf[f["train"]], y[f["train"]])
        predicted = model.predict(Xf[f["val"]])
        out[f["val"]] = predicted
        fold_scores.append({
            "fold": f["fold"],
            "n_train": int(len(f["train"])),
            "n_val": int(len(f["val"])),
            "gap_excluded": int(f["gap_excluded"]),
            "accuracy": float(accuracy_score(y[f["val"]], predicted)),
            "macro_f1": float(f1_score(y[f["val"]], predicted, labels=STATIC_CLASSES, average="macro", zero_division=0)),
        })
    return out, fold_scores


def pooled_metrics(y: np.ndarray, predicted: np.ndarray) -> dict:
    report = classification_report(y, predicted, labels=STATIC_CLASSES, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y, predicted, labels=STATIC_CLASSES)
    return {
        "accuracy": float(accuracy_score(y, predicted)),
        "macro_f1": float(report["macro avg"]["f1-score"]),
        "per_class": {
            c: {"precision": float(report[c]["precision"]), "recall": float(report[c]["recall"]),
                "f1": float(report[c]["f1-score"]), "support": int(report[c]["support"])}
            for c in STATIC_CLASSES
        },
        "confusion_matrix": matrix.tolist(),
    }


def summarise(values: list[float]) -> dict:
    arr = np.array(values)
    return {"mean": float(arr.mean()), "std": float(arr.std(ddof=1)) if len(arr) > 1 else 0.0,
            "min": float(arr.min()), "max": float(arr.max()), "n": int(len(arr))}


def shuffle_control(X: np.ndarray, y: np.ndarray, folds: list[dict], algorithm: str) -> dict:
    """Labels are permuted across all frames; the same blocks and gaps are used. Accuracy should fall to chance."""
    runs = []
    for seed in SHUFFLE_SEEDS:
        permuted = np.random.default_rng(seed).permutation(y)
        predicted, _ = run_cv(X, permuted, folds, algorithm, "full", seed=seed)
        runs.append({"seed": seed, "accuracy": float(accuracy_score(permuted, predicted)),
                     "macro_f1": float(f1_score(permuted, predicted, labels=STATIC_CLASSES, average="macro",
                                                zero_division=0))})
    return {
        "runs": runs,
        "accuracy": summarise([r["accuracy"] for r in runs]),
        "macro_f1": summarise([r["macro_f1"] for r in runs]),
    }


def presence_decodability(X: np.ndarray, variant: str, folds: list[dict]) -> dict:
    """How well the true presence pattern (left, right) can be predicted from each variant's features, in
    held-out blocks. High accuracy means presence is still encoded in that variant."""
    pattern = np.array([f"L{int(l)}R{int(r)}" for l, r in X[:, 129:131]])
    predicted = np.empty(len(pattern), dtype=object)
    for f in folds:
        Xf = transform(X, variant, f["train"])
        model = RandomForestClassifier(n_estimators=300, random_state=0, n_jobs=-1).fit(Xf[f["train"]], pattern[f["train"]])
        predicted[f["val"]] = model.predict(Xf[f["val"]])
    majority = max(np.unique(pattern, return_counts=True)[1]) / len(pattern)
    return {"accuracy": float(accuracy_score(pattern, predicted)), "majority_baseline": float(majority),
            "patterns": {p: int(np.sum(pattern == p)) for p in np.unique(pattern)}}


def bundle_for(variant: str, model, algorithm: str, means: dict | None) -> dict:
    labels = sorted(STATIC_CLASSES)
    if [str(c) for c in model.classes_] != labels:
        raise SystemExit("model class order does not match the sorted label list")
    base = {
        "model": model,
        "labels": labels,
        "classes": [str(c) for c in model.classes_],
        "version": 1,
        "candidate_version": CANDIDATE_VERSION,
        "model_type": algorithm,
        "variant": variant,
        "verification": "unverified_dataset",
        "experimental": True,
        "candidate_status": "not_activated",
        "dataset_version": DATASET_VERSION,
        "citation": CITATION,
        "validation": VALIDATION_NOTE,
        "excluded_from_v1": HELD_CLASSES,
    }
    if variant == "full":
        return {**base, "feature_count": PHRASE_FEATURE_COUNT, "feature_contract": PHRASE_FEATURE_CONTRACT}
    if variant == "presence_ablated":
        return {**base, "feature_count": PHRASE_FEATURE_COUNT, "feature_contract": "static_v1_presence_masked_131",
                "masked_columns": PRESENCE_COLUMNS, "candidate_status": "experiment_only_not_servable"}
    if variant == "presence_ablated_imputed":
        return {**base, "feature_count": PHRASE_FEATURE_COUNT,
                "feature_contract": "static_v1_presence_imputed_131", "masked_columns": PRESENCE_COLUMNS,
                "imputation_means": {k: [float(v) for v in arr] for k, arr in means.items()},
                "candidate_status": "experiment_only_not_servable"}
    return {**base, "feature_count": len(PRESENCE_COLUMNS), "feature_contract": "static_v1_presence_only_2",
            "columns": PRESENCE_COLUMNS, "candidate_status": "experiment_only_not_servable"}


def delta(a: dict, b: dict) -> dict:
    return {
        "accuracy": a["accuracy"] - b["accuracy"],
        "macro_f1": a["macro_f1"] - b["macro_f1"],
        "per_class_f1": {c: a["per_class"][c]["f1"] - b["per_class"][c]["f1"] for c in STATIC_CLASSES},
    }


def presence_verdict(full: dict, imputed: dict, presence_only: dict) -> str:
    drop = full["macro_f1"] - imputed["macro_f1"]
    if presence_only["macro_f1"] >= full["macro_f1"] - 0.05:
        return ("Presence flags alone reach nearly the full model's macro-F1: the classifier relies heavily on hand "
                "presence.")
    if drop > 0.15:
        return ("Removing presence evidence (imputed variant) costs more than 0.15 macro-F1: the model depends on "
                "presence information.")
    if drop >= 0.05:
        return ("Removing presence evidence (imputed variant) costs 0.05 to 0.15 macro-F1: presence contributes, but "
                "is not the whole story.")
    return ("Removing presence evidence (imputed variant) costs under 0.05 macro-F1. This does NOT show that presence "
            "is unused: presence is correlated with class in this data, and within-clip validation cannot separate "
            "hand-shape learning from memorisation of one clip. Treat this as inconclusive.")


def markdown_report(results: dict, shuffles: dict, chance: dict, decodability: dict) -> str:
    lines = [
        "# Static candidate evaluation: static_v1", "",
        f"> **{VALIDATION_NOTE}**", "",
        "Classes: " + ", ".join(STATIC_CLASSES) + ". Held: " + ", ".join(HELD_CLASSES) + ".", "",
        "## Presence decodability (random forest, same blocks)", "",
        "How well the true presence pattern can still be predicted from each variant's features. High accuracy means "
        "the variant still carries presence information. **Confounded:** presence is almost fixed per class in this "
        "dataset, so the features predict presence through class identity even when the flags are masked. These "
        "numbers therefore cannot prove that presence is encoded, or that it is absent.", "",
        "| Variant | Decoded accuracy | Majority baseline |", "| --- | ---: | ---: |",
    ]
    for variant in VARIANTS:
        d = decodability[variant]
        lines.append(f"| {variant} | {d['accuracy']:.3f} | {d['majority_baseline']:.3f} |")
    lines.append("")
    for algorithm in ALGORITHMS:
        r = results[algorithm]
        lines += [f"## Algorithm: {algorithm}", ""]
        for variant in VARIANTS:
            v = r[variant]
            p = v["pooled"]
            fa = v["fold_accuracy"]
            ff = v["fold_macro_f1"]
            lines += [
                f"### Variant: {variant}", "",
                f"- Pooled out-of-block accuracy: {p['accuracy']:.3f}; macro-F1: {p['macro_f1']:.3f}",
                f"- Fold accuracy mean +/- sd: {fa['mean']:.3f} +/- {fa['std']:.3f} (min {fa['min']:.3f}, max {fa['max']:.3f})",
                f"- Fold macro-F1 mean +/- sd: {ff['mean']:.3f} +/- {ff['std']:.3f} (min {ff['min']:.3f}, max {ff['max']:.3f})",
                "",
                "| Class | Precision | Recall | F1 | Support |", "| --- | ---: | ---: | ---: | ---: |",
            ]
            for c in STATIC_CLASSES:
                pc = p["per_class"][c]
                lines.append(f"| {c} | {pc['precision']:.3f} | {pc['recall']:.3f} | {pc['f1']:.3f} | {pc['support']} |")
            lines += ["", "Confusion matrix (rows = true, columns = predicted):", "",
                      "| true \\ pred | " + " | ".join(c[:8] for c in STATIC_CLASSES) + " |",
                      "| --- |" + " ---: |" * len(STATIC_CLASSES)]
            for i, c in enumerate(STATIC_CLASSES):
                lines.append(f"| {c} | " + " | ".join(str(x) for x in p["confusion_matrix"][i]) + " |")
            lines.append("")
        lines += [
            "### Presence comparison", "",
            f"- Full minus presence-ablated (flags masked): accuracy {r['delta_full_minus_ablated']['accuracy']:+.3f}, "
            f"macro-F1 {r['delta_full_minus_ablated']['macro_f1']:+.3f}",
            f"- Full minus presence-ablated-imputed: accuracy {r['delta_full_minus_imputed']['accuracy']:+.3f}, "
            f"macro-F1 {r['delta_full_minus_imputed']['macro_f1']:+.3f}",
            f"- Full minus presence-only: accuracy {r['delta_full_minus_presence_only']['accuracy']:+.3f}, "
            f"macro-F1 {r['delta_full_minus_presence_only']['macro_f1']:+.3f}",
            f"- Verdict: {r['presence_verdict']}", "",
        ]
        s = shuffles[algorithm]
        lines += [
            "### Label-shuffle control (full variant, 10 seeds)", "",
            f"- Accuracy: mean {s['accuracy']['mean']:.3f} +/- {s['accuracy']['std']:.3f}, "
            f"range {s['accuracy']['min']:.3f} to {s['accuracy']['max']:.3f}",
            f"- Macro-F1: mean {s['macro_f1']['mean']:.3f} +/- {s['macro_f1']['std']:.3f}, "
            f"range {s['macro_f1']['min']:.3f} to {s['macro_f1']['max']:.3f}",
            f"- Chance (uniform over 9 classes): {chance['uniform']:.3f}; majority class: {chance['majority']:.3f}",
            "",
        ]
    return "\n".join(lines) + "\n"


def model_card(chosen: str, results: dict, shuffles: dict, chance: dict, decodability: dict, generated: str) -> str:
    r = results[chosen]
    full = r["full"]["pooled"]
    flagged = r["presence_ablated"]["pooled"]
    imputed = r["presence_ablated_imputed"]["pooled"]
    presence = r["presence_only"]["pooled"]
    shuffle = shuffles[chosen]["macro_f1"]
    return f"""# Model card: static_v1 phrase candidate (experimental, NOT activated)

**Status: EXPERIMENTAL / UNVERIFIED. Research use only. Not a verified ISL translation. Not activated in Live Studio.**

Generated: {generated}

## What it is
A candidate classifier for nine single-frame static phrases, trained on the existing 131-value phrase feature
contract (`{PHRASE_FEATURE_CONTRACT}`). It is saved separately from the active phrase model
(`ai-engine/models/phrase_classifier.joblib`, which is untouched). The candidate file is `candidate_full.joblib`.

## Classes
- Included (9): {", ".join(STATIC_CLASSES)}
- Held, not trained: {", ".join(HELD_CLASSES)} (data quality too low)
- Dynamic and undetermined phrases are excluded.

## Data
- Dataset version `{DATASET_VERSION}`, from `images for phrases` (licence unknown; do not redistribute).
- 242 eligible frames: one representative per near-duplicate group, each with a detected hand.
- Landmarks: MediaPipe IMAGE mode on still photos (stored in `landmarks.npz`).
- Each class comes from one assumed clip (`assumed_single_clip_unverified`). Frame rate unknown.

## Validation
- **{VALIDATION_NOTE}**
- Contiguous frame blocks per class, {N_BLOCKS} folds, with a {GAP_FRAMES}-frame gap around each validation block.
- Label-shuffle control: 10 seeds, full variant. Distribution reported, not a single run.
- Presence ablation: four variants (see `evaluation_report.md`).

## Internal results (NOT real-world accuracy)
- Chosen algorithm: {chosen}.
- Pooled out-of-block accuracy: full {full['accuracy']:.3f}; flags masked {flagged['accuracy']:.3f};
  flags masked and absent hands imputed {imputed['accuracy']:.3f}; presence only {presence['accuracy']:.3f}.
- Pooled macro-F1: full {full['macro_f1']:.3f}; flags masked {flagged['macro_f1']:.3f};
  imputed {imputed['macro_f1']:.3f}; presence only {presence['macro_f1']:.3f}.
- Label-shuffle macro-F1: mean {shuffle['mean']:.3f} +/- {shuffle['std']:.3f} across 10 seeds
  (uniform chance {chance['uniform']:.3f}).
- Presence decodability from the imputed variant: {decodability['presence_ablated_imputed']['accuracy']:.3f}
  (majority baseline {decodability['presence_ablated_imputed']['majority_baseline']:.3f}).
  Presence from the flags-masked variant: {decodability['presence_ablated']['accuracy']:.3f}.

## Limitations (all apply)
1. Within-clip validation only. No signer-independent or clip-independent test exists. Scores are not accuracy claims.
2. Presence shortcut: four classes are right-hand only and one is almost always right-hand only. Presence-only
   performance is reported beside the full model.
3. Presence ablation is INCONCLUSIVE. Masking the two flag columns does not remove presence: absent hands are all-zero
   blocks and the wrist offset is zero. The imputed variant reduces this, but presence is still decodable, and
   presence is almost fixed per class, so it is also carried by class identity. Within-clip validation cannot
   separate hand-shape learning from memorisation of one clip. The absence of a drop in the ablated variants is
   therefore NOT evidence that the model ignores hand presence.
4. Domain gap: training uses MediaPipe IMAGE mode on still photos. Live inference uses VIDEO mode with tracking on
   webcam frames. The feature function is identical, but the landmarks are not the same kind of signal. Replay
   parity confirms the code path, not webcam generalisation.
5. Very small classes (19 to 38 frames). Some classes come from one clip with little variety.
6. Not reviewed by a qualified ISL signer or interpreter. ISL versus ASL is not determinable from the images.
7. Confidence is the model's probability, not a calibrated accuracy. The live threshold (0.7) is not calibrated for
   this model.

## Activation
Not approved. Loading this file through the live recognizer would require copying it over the active model path,
which is a separate, explicitly approved step (Stage 5). The ablated, imputed and presence-only bundles carry
different feature contracts and are refused by the live loader.

## Citation and licence
{CITATION}
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--overwrite", action="store_true", help="replace an existing static_v1 folder")
    args = parser.parse_args()
    if OUT.exists() and not args.overwrite:
        print(f"Refusing to overwrite {OUT}. Use --overwrite.")
        return 2

    active_before = sha256_file(ACTIVE_MODEL)
    X, y, frames, meta = load_samples()
    folds = block_folds(y, frames)
    counts = {c: int(np.sum(y == c)) for c in STATIC_CLASSES}
    chance = {"uniform": 1 / len(STATIC_CLASSES), "majority": max(counts.values()) / len(y)}
    print(f"samples {len(y)} | classes {len(STATIC_CLASSES)} | folds {N_BLOCKS} | gap {GAP_FRAMES} frames")
    for f in folds:
        print(f"  fold {f['fold']}: train {len(f['train'])}, val {len(f['val'])}, gap-excluded {f['gap_excluded']}")

    results: dict = {}
    for algorithm in ALGORITHMS:
        results[algorithm] = {}
        for variant in VARIANTS:
            predicted, fold_scores = run_cv(X, y, folds, algorithm, variant)
            pooled = pooled_metrics(y, predicted)
            results[algorithm][variant] = {
                "pooled": pooled,
                "folds": fold_scores,
                "fold_accuracy": summarise([f["accuracy"] for f in fold_scores]),
                "fold_macro_f1": summarise([f["macro_f1"] for f in fold_scores]),
            }
            print(f"{algorithm:20s} {variant:25s} pooled acc {pooled['accuracy']:.3f} macroF1 {pooled['macro_f1']:.3f}")
        full = results[algorithm]["full"]["pooled"]
        flagged = results[algorithm]["presence_ablated"]["pooled"]
        imputed = results[algorithm]["presence_ablated_imputed"]["pooled"]
        presence = results[algorithm]["presence_only"]["pooled"]
        results[algorithm]["delta_full_minus_ablated"] = delta(full, flagged)
        results[algorithm]["delta_full_minus_imputed"] = delta(full, imputed)
        results[algorithm]["delta_full_minus_presence_only"] = delta(full, presence)
        results[algorithm]["presence_verdict"] = presence_verdict(full, imputed, presence)

    decodability = {variant: presence_decodability(X, variant, folds) for variant in VARIANTS}
    for variant in VARIANTS:
        d = decodability[variant]
        print(f"presence decodability {variant:25s} {d['accuracy']:.3f} (majority {d['majority_baseline']:.3f})")

    shuffles = {}
    for algorithm in ALGORITHMS:
        shuffles[algorithm] = shuffle_control(X, y, folds, algorithm)
        s = shuffles[algorithm]
        print(f"shuffle {algorithm:20s} acc mean {s['accuracy']['mean']:.3f} sd {s['accuracy']['std']:.3f} "
              f"range {s['accuracy']['min']:.3f}-{s['accuracy']['max']:.3f}")

    chosen = max(ALGORITHMS, key=lambda a: results[a]["full"]["fold_macro_f1"]["mean"])
    print(f"chosen algorithm (highest full-variant mean fold macro-F1): {chosen}")

    generated = datetime.now(UTC).isoformat(timespec="seconds")
    OUT.mkdir(parents=True, exist_ok=True)
    all_idx = np.arange(len(y))
    artifacts = {}
    file_names = {
        "full": "candidate_full.joblib",
        "presence_ablated": "experiment_presence_ablated.joblib",
        "presence_ablated_imputed": "experiment_presence_ablated_imputed.joblib",
        "presence_only": "experiment_presence_only.joblib",
    }
    for variant in VARIANTS:
        means = imputation_means(X, all_idx) if variant == "presence_ablated_imputed" else None
        Xv = transform(X, variant, all_idx, means)
        model = make_model(chosen, 0).fit(Xv, y)
        bundle = bundle_for(variant, model, chosen, means)
        joblib.dump(bundle, OUT / file_names[variant])
        artifacts[variant] = {"file": file_names[variant], "sha256": sha256_file(OUT / file_names[variant])}

    manifest_sha = sha256_file(MANIFEST)
    landmarks_sha = sha256_file(LANDMARKS)
    active_after = sha256_file(ACTIVE_MODEL)
    if active_before != active_after:
        raise SystemExit("the active phrase model changed during the run")

    config = {
        "candidate_version": CANDIDATE_VERSION,
        "dataset_version": DATASET_VERSION,
        "generated_at": generated,
        "classes": sorted(STATIC_CLASSES),
        "held_classes": HELD_CLASSES,
        "class_counts": counts,
        "samples": int(len(y)),
        "feature_count": PHRASE_FEATURE_COUNT,
        "feature_contract": PHRASE_FEATURE_CONTRACT,
        "presence_columns": PRESENCE_COLUMNS,
        "wrist_zero_columns": WRIST_ZERO_COLUMNS,
        "validation": {"method": "within-clip contiguous blocks per class", "folds": N_BLOCKS,
                       "gap_frames": GAP_FRAMES, "independent": False, "note": VALIDATION_NOTE},
        "algorithms": {
            "random_forest": {"n_estimators": 300, "random_state": 0, "n_jobs": -1},
            "logistic_regression": {"scaler": "StandardScaler", "max_iter": 5000, "C": 1.0},
        },
        "shuffle_seeds": SHUFFLE_SEEDS,
        "chosen_algorithm": chosen,
        "chosen_rule": "highest mean fold macro-F1 for the full variant",
        "chance": chance,
        "inputs": {"manifest_sha256": manifest_sha, "landmarks_sha256": landmarks_sha,
                   "dataset_summary": SUMMARY.name},
        "active_phrase_model_sha256_before": active_before,
        "active_phrase_model_sha256_after": active_after,
        "artifacts": artifacts,
        "folds": [{"fold": f["fold"], "n_train": int(len(f["train"])), "n_val": int(len(f["val"])),
                   "gap_excluded": int(f["gap_excluded"])} for f in folds],
    }
    with open(OUT / "training_report.json", "w", encoding="utf-8") as handle:
        json.dump({"config": config, "results": results, "presence_decodability": decodability,
                   "shuffle_control": shuffles}, handle, indent=2)

    class_map = {
        "labels": sorted(STATIC_CLASSES),
        "index": {c: i for i, c in enumerate(sorted(STATIC_CLASSES))},
        "held_not_trained": HELD_CLASSES,
        "excluded_categories": "dynamic and undetermined phrases are not in static_v1",
    }
    (OUT / "class_map.json").write_text(json.dumps(class_map, indent=2), encoding="utf-8")

    feature_config = {
        "contract": PHRASE_FEATURE_CONTRACT,
        "feature_count": PHRASE_FEATURE_COUNT,
        "layout": {"0:63": "Left normalize_hand", "63:126": "Right normalize_hand",
                   "126:129": "wrist offset (Right - Left) / Left hand size, when both present",
                   "129": "Left present flag", "130": "Right present flag"},
        "presence_columns": PRESENCE_COLUMNS,
        "wrist_zero_columns": WRIST_ZERO_COLUMNS,
        "normalisation": "backend/app/services/landmark_features.py::normalize_hand (2D wrist-to-middle-MCP scale)",
        "source_function": "backend/app/services/phrase_features.py::build_phrase_features (not modified)",
        "training_landmark_mode": "MediaPipe HandLandmarker IMAGE mode on still photos",
        "live_landmark_mode": "MediaPipe HandLandmarker VIDEO mode with tracking (not the same signal)",
        "variants": {
            "full": "all 131 columns",
            "presence_ablated": "columns 129 and 130 set to 0 (experiment only)",
            "presence_ablated_imputed": "flags set to 0; absent-hand blocks and offsets set to training-fold means "
                                        "(experiment only; means stored in the bundle)",
            "presence_only": "columns 129 and 130 only (experiment only)",
        },
        "dtype": "float64 in the training matrix",
    }
    (OUT / "feature_config.json").write_text(json.dumps(feature_config, indent=2), encoding="utf-8")

    (OUT / "evaluation_report.md").write_text(
        markdown_report(results, shuffles, chance, decodability), encoding="utf-8")
    (OUT / "model_card.md").write_text(
        model_card(chosen, results, shuffles, chance, decodability, generated), encoding="utf-8")

    for algorithm in ALGORITHMS:
        for variant in VARIANTS:
            matrix = np.array(results[algorithm][variant]["pooled"]["confusion_matrix"])
            np.savetxt(OUT / f"confusion_{algorithm}_{variant}.csv", matrix, fmt="%d", delimiter=",")

    print(f"\nwrote {OUT}")
    for name, item in artifacts.items():
        print(f"  {name}: {item['file']} sha256 {item['sha256'][:16]}")
    print(f"active model unchanged: {active_before == active_after}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
