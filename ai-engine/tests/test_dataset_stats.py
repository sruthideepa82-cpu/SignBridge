import json
import sys
from pathlib import Path

import pytest

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ENGINE_DIR / "collection"))

from dataset_stats import (  # noqa: E402
    assign_splits,
    check_split,
    iter_samples,
    load_split_table,
    summarize,
)


def sample(label: str, participant: str, session: str = "s1") -> dict:
    return {"label": label, "participant": participant, "session": session, "hands": []}


def test_summarize_counts_samples_participants_and_sessions() -> None:
    samples = [
        sample("A", "P001", "s1"),
        sample("A", "P001", "s2"),
        sample("A", "P002", "s1"),
        sample("B", "P001", "s1"),
    ]

    report = summarize(samples)

    assert report["total"] == 4
    assert report["classes"]["A"] == {"samples": 3, "participants": 2, "sessions": 2}
    assert report["classes"]["B"] == {"samples": 1, "participants": 1, "sessions": 1}


def test_iter_samples_reads_jsonl_files_only(tmp_path: Path) -> None:
    (tmp_path / "one.jsonl").write_text(json.dumps(sample("A", "P001")) + "\n\n", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("ignored", encoding="utf-8")

    assert [s["label"] for s in iter_samples(tmp_path)] == ["A"]


def test_split_is_reproducible_and_covers_every_participant() -> None:
    participants = [f"P{i:03d}" for i in range(1, 21)]

    first = assign_splits(participants, seed=7)
    second = assign_splits(participants, seed=7)

    assert first == second
    assert set(first) == set(participants)
    assert set(first.values()) == {"train", "val", "test"}
    assert sum(1 for v in first.values() if v == "train") == 14


def test_split_changes_with_seed() -> None:
    participants = [f"P{i:03d}" for i in range(1, 21)]

    assert assign_splits(participants, seed=1) != assign_splits(participants, seed=2)


def test_split_rejects_ratios_that_do_not_sum_to_one() -> None:
    with pytest.raises(ValueError):
        assign_splits(["P001"], seed=1, ratios=(0.5, 0.5, 0.5))


def test_check_reports_unassigned_participants_and_coverage_gaps() -> None:
    table = {"P001": "train", "P002": "train", "P003": "val", "P004": "test"}
    samples = [
        sample("A", "P001"),
        sample("A", "P002"),
        sample("A", "P003"),
        sample("A", "P004"),
        sample("A", "P999"),
    ]

    result = check_split(samples, table, min_participants_per_split=1)

    assert result["unassigned_participants"] == ["P999"]
    assert result["ok"] is False


def test_check_flags_classes_with_too_few_test_participants() -> None:
    table = {"P001": "train", "P002": "train", "P003": "val", "P004": "val", "P005": "test"}
    samples = [sample("A", p) for p in ["P001", "P002", "P003", "P004", "P005"]]

    result = check_split(samples, table, min_participants_per_split=2)

    gaps = {(g["label"], g["split"]) for g in result["coverage_gaps"]}
    assert ("A", "test") in gaps
    assert ("A", "train") not in gaps
    assert result["unassigned_participants"] == []


def test_check_passes_when_every_split_is_covered() -> None:
    table = {"P001": "train", "P002": "train", "P003": "val", "P004": "val", "P005": "test", "P006": "test"}
    samples = [sample("A", p) for p in table]

    result = check_split(samples, table, min_participants_per_split=2)

    assert result == {"unassigned_participants": [], "coverage_gaps": [], "ok": True}


def test_split_table_rejects_unknown_split(tmp_path: Path) -> None:
    path = tmp_path / "split.csv"
    path.write_text("participant,split\nP001,holdout\n", encoding="utf-8")

    with pytest.raises(ValueError):
        load_split_table(path)
