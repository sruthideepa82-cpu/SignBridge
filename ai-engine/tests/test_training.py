"""Pipeline tests on synthetic landmarks. These check the code paths only, not sign accuracy."""

import json
import sys
from pathlib import Path

import numpy as np

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ENGINE_DIR / "training"))
sys.path.insert(0, str(AI_ENGINE_DIR / "collection"))

import train_static_classifier  # noqa: E402
from prepare_dataset import prepare, require_all_splits  # noqa: E402

VOCABULARY = {
    "classes": [
        {"label": "C", "verified": True, "reference": "ISLRTC-ALPHABET", "hands": 1},
        {"label": "L", "verified": True, "reference": "ISLRTC-ALPHABET", "hands": 1},
        {"label": "TWO", "verified": True, "reference": "x", "hands": 2},
        {"label": "NOPE", "verified": False, "reference": "x", "hands": 1},
    ]
}


def hand_points(seed: int, scale: float) -> list[list[float]]:
    rng = np.random.default_rng(seed)
    points = rng.normal(0.0, 1.0, size=(21, 3)) * scale
    points[:, 2] *= 0.1
    return (points + 0.5).tolist()


def make_sample(label: str, participant: str, seed: int, hands: int = 1) -> dict:
    scale = 0.05 if label == "C" else 0.5
    return {
        "label": label,
        "participant": participant,
        "session": "s1",
        "hands": [{"handedness": "Right", "score": 0.9, "landmarks": hand_points(seed, scale)} for _ in range(hands)],
    }


def split_table_for(participants_per_split: dict[str, list[str]]) -> dict[str, str]:
    return {p: split for split, names in participants_per_split.items() for p in names}


SPLITS = {
    "train": ["P001", "P002", "P003"],
    "val": ["P004", "P005"],
    "test": ["P006", "P007"],
}


def full_samples() -> list[dict]:
    samples = []
    seed = 0
    for participants in SPLITS.values():
        for participant in participants:
            for label in ["C", "L"]:
                for _ in range(4):
                    seed += 1
                    samples.append(make_sample(label, participant, seed))
    return samples


def test_prepare_keeps_only_verified_one_hand_samples_and_counts_skips() -> None:
    samples = full_samples() + [
        make_sample("TWO", "P001", 900, hands=2),
        make_sample("NOPE", "P001", 901),
        make_sample("C", "P999", 902),
        make_sample("C", "P001", 903, hands=2),
    ]

    dataset = prepare(samples, split_table_for(SPLITS), VOCABULARY)

    assert dataset.features.shape == (2 * 4 * 7, 63)
    assert set(dataset.labels.tolist()) == {"C", "L"}
    assert dataset.skipped["unverified_class"] == 1
    assert dataset.skipped["no_split_assignment"] == 1
    assert dataset.skipped["unsupported_hand_count"] >= 2


def test_require_all_splits_flags_thin_coverage() -> None:
    dataset = prepare(full_samples()[:6], split_table_for(SPLITS), VOCABULARY)

    problems = require_all_splits(dataset, min_participants=2)

    assert any("test" in problem for problem in problems)


def test_training_writes_model_and_report_when_splits_are_covered(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "synthetic.jsonl").write_text(
        "\n".join(json.dumps(sample) for sample in full_samples()) + "\n", encoding="utf-8"
    )
    split_path = tmp_path / "split_table.csv"
    split_path.write_text(
        "participant,split\n" + "\n".join(f"{p},{s}" for s, ps in SPLITS.items() for p in ps) + "\n",
        encoding="utf-8",
    )
    vocabulary_path = tmp_path / "vocabulary.json"
    vocabulary_path.write_text(json.dumps(VOCABULARY), encoding="utf-8")
    models_dir = tmp_path / "models"

    code = train_static_classifier.main(
        [
            "--raw", str(raw),
            "--split-table", str(split_path),
            "--vocabulary", str(vocabulary_path),
            "--models-dir", str(models_dir),
            "--min-participants", "2",
        ]
    )

    report = json.loads((models_dir / "static_classifier_report.json").read_text(encoding="utf-8"))
    assert code == 0
    assert (models_dir / "static_classifier.joblib").is_file()
    assert report["test"]["samples"] == 2 * 4 * 2
    assert 0.0 <= report["test"]["accuracy"] <= 1.0


def test_training_refuses_when_a_split_is_empty(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    train_only = [s for s in full_samples() if s["participant"] in SPLITS["train"]]
    (raw / "train_only.jsonl").write_text("\n".join(json.dumps(s) for s in train_only) + "\n", encoding="utf-8")
    split_path = tmp_path / "split_table.csv"
    split_path.write_text(
        "participant,split\n" + "\n".join(f"{p},{s}" for s, ps in SPLITS.items() for p in ps) + "\n",
        encoding="utf-8",
    )
    vocabulary_path = tmp_path / "vocabulary.json"
    vocabulary_path.write_text(json.dumps(VOCABULARY), encoding="utf-8")

    code = train_static_classifier.main(
        [
            "--raw", str(raw),
            "--split-table", str(split_path),
            "--vocabulary", str(vocabulary_path),
            "--models-dir", str(tmp_path / "models"),
        ]
    )

    assert code == 2
    assert not (tmp_path / "models" / "static_classifier.joblib").exists()
