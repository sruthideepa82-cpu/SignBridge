"""Turn recorded landmark samples into training arrays, using the participant-level split table.

Only classes marked verified in vocabulary.json are used, and only samples with the hand count the class
expects. Features come from backend/app/services/landmark_features.py, the same code the live recognizer uses.
"""

import sys
from collections import Counter, defaultdict
from collections.abc import Callable
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


def participant_splitter(split_table: dict[str, str]) -> Callable[[dict], str | None]:
    """Multi-participant mode: every sample takes its participant's split from the split table."""
    return lambda sample: split_table.get(sample["participant"])


def pilot_splitter(samples: list[dict]) -> Callable[[dict], str | None]:
    """Single-signer pilot: for each letter, the most recent session is the test set and the rest train.

    Session IDs are timestamps, so the largest one is the latest. This checks generalization across
    sessions, not across people.
    """
    sessions_by_label: dict[str, set[str]] = defaultdict(set)
    for sample in samples:
        sessions_by_label[sample["label"]].add(sample["session"])
    test_session = {label: max(sessions) for label, sessions in sessions_by_label.items()}
    return lambda sample: "test" if sample["session"] == test_session[sample["label"]] else "train"


def prepare(
    samples,
    split_of: Callable[[dict], str | None],
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
        split = split_of(sample)
        if split is None:
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
        splits.append(split)

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


def require_pilot_coverage(dataset: PreparedDataset, min_train: int, min_test: int) -> list[str]:
    """Single-signer pilot: every letter needs samples in both the training and test sessions."""
    problems = []
    for label in sorted(set(dataset.labels.tolist())):
        for split, minimum in (("train", min_train), ("test", min_test)):
            count = int(((dataset.labels == label) & (dataset.splits == split)).sum())
            if count < minimum:
                problems.append(
                    f"letter {label} has {count} sample(s) in the {split} sessions; need {minimum}. "
                    "Record at least two separate sessions per letter."
                )
    return problems


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
