"""Tests for the public-dataset training pipeline. The data here is synthetic and is only used to exercise the code.
No model trained in these tests is written to the dataset or to the active model location."""

import sys
from pathlib import Path

import joblib
import numpy as np
import pytest
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "ai-engine" / "public_datasets" / "isl_static"))
sys.path.insert(0, str(REPO / "backend"))

import train_public_static as train  # noqa: E402
from app.services.recognition_service import StaticRecognizer  # noqa: E402


def record(file_id, label, dhash=None, sha="s", rel="x.jpg"):
    return {"row": file_id, "file_id": str(file_id), "label": label, "rel_path": rel, "age_group": "Kids",
            "sleeve": "Full Sleeves", "sha256": sha, "dhash": dhash}


def test_approved_classes_are_the_sixteen_selected_letters():
    assert train.APPROVED == ["A", "B", "C", "D", "F", "G", "I", "K", "M", "N", "P", "R", "S", "T", "W", "X"]
    assert not set(train.APPROVED) & set(train.EXCLUDED_REVIEW + train.EXCLUDED_DYNAMIC)


def test_non_approved_classes_are_logged_not_silently_dropped():
    records = [record(1, "A", sha="a"), record(2, "E", sha="e"), record(3, "H", sha="h")]

    kept, log = train.apply_exclusions(records, root=None)

    assert [r["label"] for r in kept] == ["A"]
    assert {item["label"] for item in log} == {"E", "H"}


def test_byte_identical_copies_with_conflicting_labels_are_removed_entirely():
    records = [record(1, "A", sha="same"), record(2, "B", sha="same"), record(3, "C", sha="other")]

    kept, log = train.apply_exclusions(records, root=None)

    assert [r["file_id"] for r in kept] == ["3"]
    assert {item["file_id"] for item in log} == {"1", "2"}


def test_byte_identical_same_label_copies_keep_one_sample():
    records = [record(1, "A", sha="same"), record(2, "A", sha="same"), record(3, "A", sha="other")]

    kept, log = train.apply_exclusions(records, root=None)

    assert sorted(r["file_id"] for r in kept) == ["1", "3"]
    assert [item["file_id"] for item in log] == ["2"]


def test_hash_matches_are_removed_only_when_pixels_confirm_the_copy(tmp_path):
    grey = np.tile(np.arange(64, dtype=np.uint8) * 3, (64, 1))
    Image.fromarray(grey).save(tmp_path / "copy_a.png")
    Image.fromarray(grey).save(tmp_path / "copy_b.png")
    rng = np.random.default_rng(0)
    Image.fromarray(rng.integers(0, 255, (64, 64), dtype=np.uint8)).save(tmp_path / "other.png")
    records = [
        {**record(1, "A", dhash=5, sha="a", rel="copy_a.png")},
        {**record(2, "B", dhash=5, sha="b", rel="copy_b.png")},
        {**record(3, "C", dhash=9, sha="c", rel="other.png")},
        {**record(4, "D", dhash=9, sha="d", rel="copy_a.png")},
    ]

    kept, log = train.apply_exclusions(records, root=tmp_path)

    assert sorted(r["file_id"] for r in kept) == ["3", "4"]
    assert {item["file_id"] for item in log} == {"1", "2"}
    assert all("pixel-confirmed" in item["reason"] for item in log)


def test_hash_groups_join_identical_hashes_transitively():
    records = [record(0, "A", dhash=1), record(1, "B", dhash=1), record(2, "C", dhash=7), record(3, "A", dhash=None)]

    groups = train.hash_groups(records)

    assert groups[0] == groups[1]
    assert groups[2] != groups[0]
    assert groups[3] not in (groups[0], groups[2])


def test_split_keeps_each_group_in_one_split_and_every_class_in_every_split():
    rng = np.random.default_rng(3)
    labels = np.array([letter for letter in "ABC" for _ in range(160)])
    groups = np.repeat(np.arange(len(labels) // 4), 4)
    rng.shuffle(groups)

    assignment = train.stratified_group_split(labels, groups, seed=0)

    for group in np.unique(groups):
        assert len(set(assignment[groups == group])) == 1
    for name in ("train", "val", "test"):
        assert set(labels[assignment == name]) == {"A", "B", "C"}
    assert (assignment == "train").sum() > (assignment == "test").sum() > 0


def synthetic_features(n_per_class: int, classes: list[str], seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X, y = [], []
    for index, letter in enumerate(classes):
        centre = np.zeros(63)
        centre[index::len(classes)] = 3.0
        X.append(centre + rng.normal(0, 0.2, size=(n_per_class, 63)))
        y += [letter] * n_per_class
    return np.vstack(X).astype(np.float32), np.array(y)


def test_training_selects_by_validation_and_returns_a_separable_model():
    classes = ["A", "B", "C"]
    X, y = synthetic_features(60, classes, seed=1)
    groups = np.arange(len(y))
    assignment = train.stratified_group_split(y, groups, seed=0)

    result = train.train_candidate(X, y, assignment, seed=0)

    assert result["selected"] in {"random_forest", "mlp"}
    selected_val = result["comparison"][result["selected"]]["validation"]["macro_f1"]
    assert all(selected_val >= row["validation"]["macro_f1"] for row in result["comparison"].values())
    assert result["test"]["accuracy"] > 0.9


def test_bundle_is_read_by_the_backend_static_recognizer(tmp_path):
    classes = ["A", "B", "C"]
    X, y = synthetic_features(60, classes, seed=2)
    assignment = train.stratified_group_split(y, np.arange(len(y)), seed=0)
    result = train.train_candidate(X, y, assignment, seed=0)
    path = tmp_path / "static_classifier.joblib"
    joblib.dump(train.bundle_for(result["final_model"], classes), path)

    recognizer = StaticRecognizer(path, threshold=0.0)

    assert recognizer.available is True
    assert recognizer.error is None
    bundle = joblib.load(path)
    assert bundle["feature_count"] == 63
    assert bundle["labels"] == list(result["final_model"].classes_)
    assert bundle["verification"] == "unverified_dataset"
    assert bundle["experimental"] is True
    prediction = recognizer.predict(X[0].reshape(21, 3).tolist())
    assert prediction.label in bundle["labels"]


def test_misclassified_rows_list_only_wrong_predictions(tmp_path):
    classes = ["A", "B"]
    X, y = synthetic_features(40, classes, seed=5)
    y = y.copy()
    y[0] = "B" if y[0] == "A" else "A"
    records = [record(i, label, rel=f"r{i}.jpg") for i, label in enumerate(y)]
    assignment = train.stratified_group_split(y, np.arange(len(y)), seed=0)
    result = train.train_candidate(X, y, assignment, seed=0)
    test_idx = result["test_index"]
    errors = train.misclassified(result["final_model"], X[test_idx], y[test_idx], [records[i] for i in test_idx],
                                 classes)

    assert all(row["true"] != row["predicted"] for row in errors)
    assert len(errors) == int(round((1 - result["test"]["accuracy"]) * len(test_idx)))


@pytest.mark.skipif(not (REPO / "ai-engine" / "dataset" / "public" / "isl_static" / "features63.npz").exists(),
                    reason="public dataset features not extracted on this machine")
def test_real_feature_file_has_63_values_and_the_approved_classes():
    X, records = train.load_records(
        REPO / "ai-engine" / "dataset" / "public" / "isl_static" / "features63.npz",
        REPO / "ai-engine" / "dataset" / "public" / "isl_static" / "inventory.csv",
    )

    assert X.shape[1] == 63
    assert np.isfinite(X).all()
    assert len(records) == X.shape[0]
