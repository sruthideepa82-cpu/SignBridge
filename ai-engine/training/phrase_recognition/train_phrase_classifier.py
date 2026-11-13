"""Train the daily-phrase classifier on the eligible static phrases only.

Usage (from the repository root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_recognition\\train_phrase_classifier.py

Inputs:  ai-engine/dataset/public/isl_phrases/landmarks.npz and phrase_inventory.csv (from the earlier steps).
Outputs: ai-engine/models/phrase_classifier.joblib (a separate bundle, the alphabet model is never touched)
         ai-engine/dataset/public/isl_phrases/training/ (report, metrics, confusion matrix, splits)

Split (no participant IDs exist in this dataset):
    Within each phrase, unique frames are ordered by file number and cut into contiguous blocks:
    the first 60% train, the next 15% validation, the last 25% test. Neighbouring frames of one clip
    stay on one side of each cut. The test split is scored once after the model is chosen on validation.
    The results are therefore not signer-independent and not clip-independent.
"""

import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "backend"))

from features import PHRASE_FEATURE_CONTRACT, PHRASE_FEATURE_COUNT, build_phrase_features  # noqa: E402

DATASET = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
MODEL_PATH = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
TRAINING_DIR = DATASET / "training"
MIN_CLASS_SAMPLES = 20
RANDOM_STATE = 0
TRAIN_SHARE, VAL_SHARE = 0.60, 0.15
CITATION = "Dataset for everyday phrases and words in Indian sign language. Source: 'images for phrases.zip' (no licence file included in the archive; licence and citation unverified)."


def load_inventory() -> tuple[list[dict], dict[str, str]]:
    with (DATASET / "phrase_inventory.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    return rows, {row["phrase"]: row["motion_class"] for row in rows}


def build_samples(eligible: set[str]) -> tuple[list[dict], dict]:
    data = np.load(DATASET / "landmarks.npz")
    landmarks, phrase, image_file = data["landmarks"], data["phrase"], data["image_file"]
    present = ~np.isnan(landmarks[:, :, 0, 0])
    samples, skipped = [], Counter()
    seen_hash = set()
    for index in range(len(phrase)):
        label = str(phrase[index])
        if label not in eligible:
            skipped["not eligible (dynamic or undetermined)"] += 1
            continue
        frame_landmarks = np.nan_to_num(landmarks[index].astype(np.float64))
        vector = build_phrase_features(frame_landmarks, present[index])
        if vector is None:
            skipped["no usable hand"] += 1
            continue
        path = DATASET / "images" / "images for phrases" / label / str(image_file[index])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if (label, digest) in seen_hash:
            skipped["exact duplicate frame"] += 1
            continue
        seen_hash.add((label, digest))
        samples.append(
            {
                "label": label,
                "file": str(image_file[index]),
                "number": int(Path(str(image_file[index])).stem),
                "features": vector,
                "two_hands": bool(present[index].all()),
            }
        )
    return samples, dict(skipped)


def block_split(samples: list[dict]) -> dict[str, list[dict]]:
    splits = {"train": [], "val": [], "test": []}
    for label in sorted({s["label"] for s in samples}):
        items = sorted((s for s in samples if s["label"] == label), key=lambda s: s["number"])
        n = len(items)
        train_end = int(round(n * TRAIN_SHARE))
        val_end = int(round(n * (TRAIN_SHARE + VAL_SHARE)))
        splits["train"] += items[:train_end]
        splits["val"] += items[train_end:val_end]
        splits["test"] += items[val_end:]
    return splits


def make_candidates():
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.neural_network import MLPClassifier
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    return {
        "random_forest": RandomForestClassifier(n_estimators=300, random_state=RANDOM_STATE, n_jobs=-1),
        "logistic_regression": make_pipeline(
            StandardScaler(), LogisticRegression(max_iter=2000, C=1.0, random_state=RANDOM_STATE)
        ),
        "mlp": make_pipeline(
            StandardScaler(),
            MLPClassifier(hidden_layer_sizes=(128,), alpha=1e-3, max_iter=500, early_stopping=True, random_state=RANDOM_STATE),
        ),
    }


def main() -> None:
    from sklearn.metrics import (
        ConfusionMatrixDisplay,
        accuracy_score,
        classification_report,
        confusion_matrix,
        f1_score,
    )
    import joblib
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    inventory, motion = load_inventory()
    eligible_rows = [r for r in inventory if r["motion_class"] == "STATIC"]
    excluded = {r["phrase"]: r["motion_class"] for r in inventory if r["motion_class"] != "STATIC"}
    counts_before = Counter()
    samples, skipped = build_samples({r["phrase"] for r in eligible_rows})
    for s in samples:
        counts_before[s["label"]] += 1
    kept = {label for label, n in counts_before.items() if n >= MIN_CLASS_SAMPLES}
    dropped_small = sorted(set(counts_before) - kept)
    samples = [s for s in samples if s["label"] in kept]
    labels = sorted(kept)
    if len(labels) < 2:
        raise SystemExit("Fewer than two eligible phrase classes; nothing to train.")

    splits = block_split(samples)
    X = {k: np.stack([s["features"] for s in v]) for k, v in splits.items()}
    y = {k: np.array([s["label"] for s in v]) for k, v in splits.items()}

    results, models = {}, {}
    for name, model in make_candidates().items():
        model.fit(X["train"], y["train"])
        val_pred = model.predict(X["val"])
        results[name] = {
            "train_accuracy": round(float(accuracy_score(y["train"], model.predict(X["train"]))), 4),
            "val_accuracy": round(float(accuracy_score(y["val"], val_pred)), 4),
            "val_macro_f1": round(float(f1_score(y["val"], val_pred, average="macro")), 4),
        }
        models[name] = model
        print(name, results[name])

    chosen = max(results, key=lambda name: results[name]["val_macro_f1"])
    print("selected on validation macro-F1:", chosen)

    final = make_candidates()[chosen]
    trainval_X = np.vstack([X["train"], X["val"]])
    trainval_y = np.concatenate([y["train"], y["val"]])
    final.fit(trainval_X, trainval_y)
    assert list(final.classes_) == labels, "classes_ order must match the stored label list"

    test_pred = final.predict(X["test"])
    test_report = classification_report(y["test"], test_pred, labels=labels, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y["test"], test_pred, labels=labels)

    TRAINING_DIR.mkdir(parents=True, exist_ok=True)
    with (TRAINING_DIR / "splits.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["split", "label", "file", "two_hands"])
        for split_name, items in splits.items():
            for s in items:
                writer.writerow([split_name, s["label"], s["file"], s["two_hands"]])
    with (TRAINING_DIR / "per_class_test_metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["phrase", "precision", "recall", "f1", "test_support", "train_samples", "val_samples", "all_samples"])
        for label in labels:
            r = test_report[label]
            writer.writerow([label, round(r["precision"], 4), round(r["recall"], 4), round(r["f1-score"], 4), int(r["support"]),
                             sum(s["label"] == label for s in splits["train"]), sum(s["label"] == label for s in splits["val"]),
                             counts_before[label]])
    fig, ax = plt.subplots(figsize=(max(8, len(labels) * 0.55), max(7, len(labels) * 0.5)))
    ConfusionMatrixDisplay(matrix, display_labels=labels).plot(ax=ax, xticks_rotation=90, colorbar=False, values_format="d")
    ax.set_title("Phrase classifier, held-out test split (scored once)")
    fig.tight_layout()
    fig.savefig(TRAINING_DIR / "confusion_matrix_test.png", dpi=130)
    plt.close(fig)

    summary = {
        "contract": PHRASE_FEATURE_CONTRACT,
        "feature_count": PHRASE_FEATURE_COUNT,
        "labels": labels,
        "excluded_phrases": excluded,
        "dropped_small_classes": dropped_small,
        "sample_counts_after_dedupe": dict(counts_before),
        "skipped": skipped,
        "split_sizes": {k: len(v) for k, v in splits.items()},
        "candidates_validation": results,
        "selected_model": chosen,
        "test_accuracy": round(float(accuracy_score(y["test"], test_pred)), 4),
        "test_macro_f1": round(float(test_report["macro avg"]["f1-score"]), 4),
        "test_per_class": {label: {k: round(v, 4) if isinstance(v, float) else v for k, v in test_report[label].items()} for label in labels},
        "test_confusion_matrix": matrix.tolist(),
        "signer_independent": False,
        "clip_independent": False,
    }
    (TRAINING_DIR / "training_report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    bundle = {
        "model": final,
        "labels": labels,
        "classes": list(final.classes_),
        "feature_count": PHRASE_FEATURE_COUNT,
        "feature_contract": PHRASE_FEATURE_CONTRACT,
        "preprocessing": {
            "per_hand": "backend normalize_hand(), 63 values per hand",
            "slots": "0 = Left, 1 = Right (MediaPipe handedness)",
            "offset": "(Right wrist - Left wrist) / Left hand size, when both hands are visible",
            "detection": "MediaPipe HandLandmarker IMAGE mode, 2 hands, 0.5 thresholds",
        },
        "version": 1,
        "model_type": chosen,
        "verification": "unverified_dataset",
        "experimental": True,
        "source": "phrase dataset images, static-phrase subset",
        "citation": CITATION,
        "excluded_phrases": excluded,
        "limitations": [
            "Trained on images of a small number of signers (identities not provided).",
            "Only phrases whose hand moves little across frames are included. Dynamic phrases are excluded.",
            "Not verified by a qualified ISL signer or interpreter.",
        ],
        "training": {
            "split": "contiguous frame blocks per phrase, 60/15/25",
            "random_state": RANDOM_STATE,
            "min_class_samples": MIN_CLASS_SAMPLES,
            "final_fit": "train + validation",
        },
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    print(f"wrote {MODEL_PATH}")
    print(f"test accuracy {summary['test_accuracy']}, macro-F1 {summary['test_macro_f1']}")


if __name__ == "__main__":
    main()
