"""Train and evaluate the static handshape classifier.

Two modes:

1. Multi-participant (default). Splits by participant using split_table.csv. The test split is scored once.
   Refuses to train when a split is empty or a class has too few participants.

2. Single-signer pilot (--pilot-single-signer). For one person's recordings only. The most recent session of
   each letter is the test set, and the earlier sessions train the model. This checks generalization across
   sessions, not across people. The report is labelled accordingly and must not be quoted as accuracy on
   other signers.

Usage (from the backend folder, after installing backend/requirements-ai.txt):

    python ..\\ai-engine\\training\\train_static_classifier.py --raw ..\\ai-engine\\dataset\\raw \\
        --split-table ..\\ai-engine\\dataset\\metadata\\split_table.csv

    python ..\\ai-engine\\training\\train_static_classifier.py --raw ..\\ai-engine\\dataset\\raw --pilot-single-signer

Writes ai-engine/models/static_classifier.joblib and static_classifier_report.json.
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
from prepare_dataset import (  # noqa: E402
    participant_splitter,
    pilot_splitter,
    prepare,
    require_all_splits,
    require_pilot_coverage,
)
from sample_record import load_vocabulary  # noqa: E402

DEFAULT_MODELS_DIR = AI_ENGINE_DIR / "models"
MODEL_FILE = "static_classifier.joblib"
REPORT_FILE = "static_classifier_report.json"
RANDOM_STATE = 0
PILOT_MIN_TRAIN_PER_LETTER = 20
PILOT_MIN_TEST_PER_LETTER = 10
PILOT_WARNING = (
    "SINGLE-SIGNER PILOT. The test set is a later session of the same person. These numbers say nothing "
    "about accuracy for other signers and must not be reported as generalization."
)


def train(features_train: np.ndarray, labels_train: np.ndarray):
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


def run(
    raw_dir: Path,
    vocabulary_path: Path,
    models_dir: Path,
    *,
    split_table_path: Path | None = None,
    pilot_single_signer: bool = False,
    min_participants: int = 2,
) -> int:
    vocabulary = load_vocabulary(vocabulary_path)
    samples = list(iter_samples(raw_dir))

    if pilot_single_signer:
        split_of = pilot_splitter(samples)
    else:
        if split_table_path is None:
            print("Give --split-table, or use --pilot-single-signer for one person's recordings.", file=sys.stderr)
            return 2
        split_of = participant_splitter(load_split_table(split_table_path))

    dataset = prepare(samples, split_of, vocabulary)
    if dataset.features.shape[0] == 0:
        print("No usable samples. Record samples for verified classes first.", file=sys.stderr)
        return 2
    print(f"Usable samples: {dataset.features.shape[0]}; skipped: {dict(dataset.skipped)}")

    if pilot_single_signer:
        problems = require_pilot_coverage(dataset, PILOT_MIN_TRAIN_PER_LETTER, PILOT_MIN_TEST_PER_LETTER)
        print(PILOT_WARNING)
    else:
        problems = require_all_splits(dataset, min_participants)
    if problems:
        print("Cannot train a valid model yet:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 2

    train_mask = dataset.splits == "train"
    test_mask = dataset.splits == "test"
    model = train(dataset.features[train_mask], dataset.labels[train_mask])
    test = evaluate(model, dataset.features[test_mask], dataset.labels[test_mask])

    report = {
        "model": "RandomForestClassifier(n_estimators=300)",
        "classes": sorted(set(dataset.labels.tolist())),
        "skipped": dict(dataset.skipped),
        "test": test,
    }
    if pilot_single_signer:
        report["evaluation"] = "single_signer_session_split"
        report["warning"] = PILOT_WARNING
        report["train_samples"] = int(train_mask.sum())
    else:
        validation = evaluate(model, dataset.features[dataset.splits == "val"], dataset.labels[dataset.splits == "val"])
        report["evaluation"] = "participant_split"
        report["validation"] = validation

    models_dir.mkdir(parents=True, exist_ok=True)
    import joblib

    joblib.dump(
        {"model": model, "labels": list(model.classes_), "feature_count": 63, "version": 1},
        models_dir / MODEL_FILE,
    )
    (models_dir / REPORT_FILE).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Held-out test accuracy: {test['accuracy']:.3f} on {test['samples']} samples")
    print(f"Wrote {models_dir / MODEL_FILE} and {models_dir / REPORT_FILE}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train the static handshape classifier.")
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--split-table", type=Path, default=None)
    parser.add_argument("--pilot-single-signer", action="store_true", help="Train on one person's sessions.")
    parser.add_argument("--vocabulary", type=Path, default=AI_ENGINE_DIR / "dataset" / "metadata" / "vocabulary.json")
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_MODELS_DIR)
    parser.add_argument("--min-participants", type=int, default=2)
    args = parser.parse_args(argv)
    return run(
        args.raw,
        args.vocabulary,
        args.models_dir,
        split_table_path=args.split_table,
        pilot_single_signer=args.pilot_single_signer,
        min_participants=args.min_participants,
    )


if __name__ == "__main__":
    sys.exit(main())
