"""Dataset counts, participant-level splits, and leakage checks for recorded landmark samples.

Usage (from the repo root):

    python ai-engine\\collection\\dataset_stats.py --raw ai-engine\\dataset\\raw \\
        --split-table ai-engine\\dataset\\metadata\\split_table.csv

Works on the JSON Lines files written by collect_static.py. Reads landmarks only.
"""

import argparse
import csv
import json
import random
import sys
from collections import Counter, defaultdict
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

SPLITS = ("train", "val", "test")


def iter_samples(raw_dir: Path) -> Iterator[dict[str, Any]]:
    for path in sorted(raw_dir.glob("*.jsonl")):
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    yield json.loads(line)


def summarize(samples: Iterable[dict[str, Any]]) -> dict[str, Any]:
    per_class: Counter = Counter()
    class_participants: dict[str, set[str]] = defaultdict(set)
    class_sessions: dict[str, set[str]] = defaultdict(set)
    total = 0
    for sample in samples:
        label = sample["label"]
        per_class[label] += 1
        class_participants[label].add(sample["participant"])
        class_sessions[label].add(sample["session"])
        total += 1
    return {
        "total": total,
        "classes": {
            label: {
                "samples": per_class[label],
                "participants": len(class_participants[label]),
                "sessions": len(class_sessions[label]),
            }
            for label in sorted(per_class)
        },
    }


def assign_splits(
    participants: Iterable[str],
    seed: int,
    ratios: tuple[float, float, float] = (0.7, 0.15, 0.15),
) -> dict[str, str]:
    """Assign each participant to exactly one split. The result is reproducible for a given seed."""
    if abs(sum(ratios) - 1.0) > 1e-9:
        raise ValueError("Split ratios must add up to 1.")
    ordered = sorted(set(participants))
    random.Random(seed).shuffle(ordered)
    total = len(ordered)
    train_end = round(total * ratios[0])
    val_end = train_end + round(total * ratios[1])
    table: dict[str, str] = {}
    for index, participant in enumerate(ordered):
        if index < train_end:
            table[participant] = "train"
        elif index < val_end:
            table[participant] = "val"
        else:
            table[participant] = "test"
    return table


def load_split_table(path: Path) -> dict[str, str]:
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    table: dict[str, str] = {}
    for row in rows:
        participant = row["participant"]
        split = row["split"]
        if split not in SPLITS:
            raise ValueError(f"Participant {participant} has unknown split '{split}'.")
        table[participant] = split
    return table


def check_split(
    samples: Iterable[dict[str, Any]],
    split_table: dict[str, str],
    min_participants_per_split: int = 2,
) -> dict[str, Any]:
    """Report samples without a split and classes with too few participants in a split.

    The split table gives each participant exactly one split, so one participant cannot end up in
    two splits. Participants with no assignment are reported. Coverage flags classes that do not
    have enough participants in every split for a meaningful score.
    """
    unassigned: set[str] = set()
    per_class_split: dict[str, dict[str, set[str]]] = defaultdict(lambda: {s: set() for s in SPLITS})
    for sample in samples:
        participant = sample["participant"]
        split = split_table.get(participant)
        if split is None:
            unassigned.add(participant)
            continue
        per_class_split[sample["label"]][split].add(participant)

    coverage_gaps = []
    for label, by_split in sorted(per_class_split.items()):
        for split in SPLITS:
            if len(by_split[split]) < min_participants_per_split:
                coverage_gaps.append(
                    {"label": label, "split": split, "participants": len(by_split[split])}
                )

    return {
        "unassigned_participants": sorted(unassigned),
        "coverage_gaps": coverage_gaps,
        "ok": not unassigned and not coverage_gaps,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Dataset counts and split checks.")
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--split-table", type=Path, default=None)
    parser.add_argument("--min-participants", type=int, default=2)
    args = parser.parse_args(argv)

    samples = list(iter_samples(args.raw))
    report = summarize(samples)
    print(f"Total samples: {report['total']}")
    for label, counts in report["classes"].items():
        print(f"  {label}: {counts['samples']} samples, {counts['participants']} participants, "
              f"{counts['sessions']} sessions")

    if args.split_table is None:
        print("No split table given; split check skipped.")
        return 0

    result = check_split(samples, load_split_table(args.split_table), args.min_participants)
    if result["unassigned_participants"]:
        print("Participants missing from the split table: " + ", ".join(result["unassigned_participants"]))
    for gap in result["coverage_gaps"]:
        print(f"Coverage gap: {gap['label']} has {gap['participants']} participant(s) in {gap['split']}")
    print("Split check: OK" if result["ok"] else "Split check: problems found")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
