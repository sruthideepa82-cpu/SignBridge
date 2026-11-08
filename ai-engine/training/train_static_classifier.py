"""Train and evaluate the static handshape classifier with a participant-level split.

Usage (from the backend folder, after installing backend/requirements-ai.txt):

    python ..\\ai-engine\\training\\train_static_classifier.py \\
        --raw ..\\ai-engine\\dataset\\raw \\
        --split-table ..\\ai-engine\\dataset\\metadata\\split_table.csv

Writes ai-engine/models/static_classifier.joblib and a metrics report. The test split is scored once,
after the model is chosen. Refuses to train when a split is empty or a class is under-represented.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(AI_ENGINE_DIR / "collection"))

from dataset_stats import iter_samples, load_split_table  # noqa: E402
from prepare_dataset import prepare, require_all_splits  # noqa: E402
from sample_record import load_vocabulary  # noqa: E402

DEFAULT_MODELS_DIR = AI_ENGINE_DIR / "models"
MODEL_FILE = "static_classifier.joblib"
REPORT_FILE = "static_classifier_report.json"
RANDOM_STATE = 0


def train(
    features_train: np.ndarray,
    labels_train: np.ndarray,
):
    from sklearn.ensemble import RandomForestClassifier

    model = RandomForestClassifier(n_estimators=300, random_state=RANDOM_STATE, n_jobs=1)
    model.fit(features_train, labels_train)
    return model


def evaluate(model, features: np.ndarray, labels: np.ndarray) -> dict:
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

    predictions = model.predict(features)
    labels_sorted = sorted(set(labels.tolist()) | set(predictions.tolist()))
    return {
        "accuracy": float(accuracy_score(labels, predictions)),
        "per_class": classification_report(
            labels, predictions, labels=labels_sorted, output_dict=True, zero_division=0
        ),
        "confusion_matrix": {
            "labels": labels_sorted,
            "matrix": confusion_matrix(labels, predictions, labels=labels_sorted).tolist(),
        },
        "samples": int(len(labels)),
    }


def run(raw_dir: Path, split_table_path: Path, vocabulary_path: Path, models_dir: Path, min_participants: int) -> int:
    vocabulary = load_vocabulary(vocabulary_path)
    dataset = prepare(iter_samples(raw_dir), load_split_table(split_table_path), vocabulary)

    if dataset.features.shape[0] == 0:
        print("No usable samples. Record samples for verified classes first.", file=sys.stderr)
        return 2
    print(f"Usable samples: {dataset.features.shape[0]}; skipped: {dict(dataset.skipped)}")

    problems = require_all_splits(dataset, min_participants)
    if problems:
        print("Cannot train a valid model yet:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 2

    train_mask = dataset.splits == "train"
    val_mask = dataset.splits == "val"
    test_mask = dataset.splits == "test"

    model = train(dataset.features[train_mask], dataset.labels[train_mask])
    validation = evaluate(model, dataset.features[val_mask], dataset.labels[val_mask])
    test = evaluate(model, dataset.features[test_mask], dataset.labels[test_mask])

    models_dir.mkdir(parents=True, exist_ok=True)
    import joblib

    joblib.dump(
        {"model": model, "labels": list(model.classes_), "feature_count": 63, "version": 1},
        models_dir / MODEL_FILE,
    )
    report = {
        "model": "RandomForestClassifier(n_estimators=300)",
        "split": "participant-level, from split_table.csv",
        "validation": validation,
        "test": test,
        "skipped": dict(dataset.skipped),
    }
    (models_dir / REPORT_FILE).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Test accuracy: {test['accuracy']:.3f} on {test['samples']} samples")
    print(f"Wrote {models_dir / MODEL_FILE} and {models_dir / REPORT_FILE}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train the static handshape classifier.")
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--split-table", type=Path, required=True)
    parser.add_argument("--vocabulary", type=Path, default=AI_ENGINE_DIR / "dataset" / "metadata" / "vocabulary.json")
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_MODELS_DIR)
    parser.add_argument("--min-participants", type=int, default=2)
    args = parser.parse_args(argv)
    return run(args.raw, args.split_table, args.vocabulary, args.models_dir, args.min_participants)


if __name__ == "__main__":
    sys.exit(main())
