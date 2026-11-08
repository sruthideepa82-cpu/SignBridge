"""Turn recorded landmark samples into training arrays, using the participant-level split table.

Only classes marked verified in vocabulary.json are used, and only samples with the hand count the class
expects. Features come from backend/app/services/landmark_features.py, the same code the live recognizer uses.
"""

import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ENGINE_DIR / "collection"))
sys.path.insert(0, str(AI_ENGINE_DIR.parent / "backend"))

from app.services.landmark_features import normalize_hand  # noqa: E402
from dataset_stats import SPLITS  # noqa: E402
from sample_record import verified_classes  # noqa: E402


@dataclass(frozen=True)
class PreparedDataset:
    features: np.ndarray
    labels: np.ndarray
    participants: np.ndarray
    splits: np.ndarray
    skipped: Counter


def prepare(
    samples,
    split_table: dict[str, str],
    vocabulary: dict,
) -> PreparedDataset:
    classes = verified_classes(vocabulary)
    features, labels, participants, splits = [], [], [], []
    skipped: Counter = Counter()
    for sample in samples:
        label = sample["label"]
        participant = sample["participant"]
        if label not in classes:
            skipped["unverified_class"] += 1
            continue
        if participant not in split_table:
            skipped["no_split_assignment"] += 1
            continue
        expected = int(classes[label]["hands"])
        hands = sample["hands"]
        if len(hands) != expected or expected != 1:
            skipped["unsupported_hand_count"] += 1
            continue
        try:
            vector = normalize_hand(hands[0]["landmarks"])
        except ValueError:
            skipped["degenerate_hand"] += 1
            continue
        features.append(vector)
        labels.append(label)
        participants.append(participant)
        splits.append(split_table[participant])

    if not features:
        return PreparedDataset(
            np.zeros((0, 63)), np.array([], dtype=object), np.array([], dtype=object), np.array([], dtype=object), skipped
        )
    return PreparedDataset(
        features=np.vstack(features),
        labels=np.array(labels, dtype=object),
        participants=np.array(participants, dtype=object),
        splits=np.array(splits, dtype=object),
        skipped=skipped,
    )


def require_all_splits(dataset: PreparedDataset, min_participants: int) -> list[str]:
    """Return problems that stop a valid evaluation (empty split, too few participants per class)."""
    problems = []
    classes = sorted(set(dataset.labels.tolist()))
    for split in SPLITS:
        mask = dataset.splits == split
        if not mask.any():
            problems.append(f"no samples in the {split} split")
            continue
        for label in classes:
            count = len(set(dataset.participants[mask & (dataset.labels == label)].tolist()))
            if count < min_participants:
                problems.append(f"class {label} has {count} participant(s) in {split}; need {min_participants}")
    return problems
