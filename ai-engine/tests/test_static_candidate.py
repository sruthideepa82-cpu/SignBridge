"""Stage 1 static candidate: split, gap, ablation, shuffle and artifact tests. No test activates the candidate."""

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pytest

AI_ENGINE = Path(__file__).resolve().parents[1]
REPO = AI_ENGINE.parent
sys.path.insert(0, str(AI_ENGINE / "training" / "phrase_experiments"))
sys.path.insert(0, str(REPO / "backend"))

import static_candidate as sc  # noqa: E402
from app.services.phrase_features import PHRASE_FEATURE_CONTRACT, PHRASE_FEATURE_COUNT  # noqa: E402
from app.services.phrase_recognizer import PhraseRecognizer  # noqa: E402

OUT = sc.OUT


def synthetic(n_per_class: int = 12, classes: int = 3):
    rng = np.random.default_rng(0)
    labels, frames, rows = [], [], []
    for c in range(classes):
        for k in range(n_per_class):
            labels.append(sc.STATIC_CLASSES[c])
            frames.append(1 + k * 3)
            x = rng.normal(size=PHRASE_FEATURE_COUNT)
            x[129] = float(c != 1)
            x[130] = 1.0
            rows.append(x)
    return np.stack(rows), np.array(labels), np.array(frames)


def test_block_folds_are_contiguous_disjoint_and_cover_validation() -> None:
    _, y, frames = synthetic()
    folds = sc.block_folds(y, frames, n_blocks=4, gap=3)
    all_val = np.concatenate([f["val"] for f in folds])
    assert sorted(all_val.tolist()) == list(range(len(y)))
    for f in folds:
        assert set(f["train"].tolist()).isdisjoint(set(f["val"].tolist()))
        for label in set(y):
            block = frames[f["val"][y[f["val"]] == label]]
            assert block.size and (block.max() - block.min()) <= frames[y == label].max()


def test_gap_removes_training_frames_next_to_validation() -> None:
    _, y, frames = synthetic()
    for f in sc.block_folds(y, frames, n_blocks=4, gap=3):
        for i in f["train"]:
            same_class_val = f["val"][y[f["val"]] == y[i]]
            assert all(abs(int(frames[i]) - int(frames[v])) > 3 for v in same_class_val)


def test_gap_zero_keeps_more_training_frames_than_gap_three() -> None:
    _, y, frames = synthetic()
    wide = sc.block_folds(y, frames, n_blocks=4, gap=3)
    narrow = sc.block_folds(y, frames, n_blocks=4, gap=0)
    assert sum(len(f["train"]) for f in narrow) >= sum(len(f["train"]) for f in wide)


def test_full_variant_is_an_unchanged_copy() -> None:
    X, _, _ = synthetic()
    out = sc.transform(X, "full", np.arange(len(X)))
    assert np.array_equal(out, X) and out is not X


def test_presence_ablation_masks_only_the_two_flags() -> None:
    X, _, _ = synthetic()
    out = sc.transform(X, "presence_ablated", np.arange(len(X)))
    assert np.all(out[:, 129:131] == 0)
    assert np.array_equal(out[:, :129], X[:, :129])


def test_presence_only_uses_two_columns() -> None:
    X, _, _ = synthetic()
    out = sc.transform(X, "presence_only", np.arange(len(X)))
    assert out.shape == (len(X), 2)
    assert np.array_equal(out, X[:, 129:131])


def test_imputation_uses_training_statistics_only() -> None:
    X, _, _ = synthetic()
    X[:, 129] = (np.arange(len(X)) % 2 == 0).astype(float)
    X[:, 130] = 1.0
    train_idx = np.arange(0, 18)
    out = sc.transform(X, "presence_ablated_imputed", train_idx)
    means = sc.imputation_means(X, train_idx)
    missing_left = X[:, 129] == 0
    assert np.allclose(out[missing_left, 0:63], means["left"])
    assert np.all(out[:, 129:131] == 0)
    other = sc.imputation_means(X, np.arange(18, 36))
    assert not np.allclose(means["left"], other["left"])


def test_shuffle_preserves_class_counts_and_is_seed_deterministic() -> None:
    y = np.array(["a"] * 5 + ["b"] * 3 + ["c"] * 2)
    first = np.random.default_rng(3).permutation(y)
    second = np.random.default_rng(3).permutation(y)
    assert np.array_equal(first, second)
    assert sorted(first.tolist()) == sorted(y.tolist())


def test_shuffle_seeds_give_a_distribution_not_one_value() -> None:
    assert len(sc.SHUFFLE_SEEDS) == 10
    y = np.array(["a"] * 20 + ["b"] * 20)
    orders = {tuple(np.random.default_rng(s).permutation(y)) for s in sc.SHUFFLE_SEEDS}
    assert len(orders) > 1


def test_bundle_metadata_marks_experimental_and_not_activated() -> None:
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    X, y, _ = synthetic(classes=9)
    labels = sorted(set(y))
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=500)).fit(X, y)
    bundle = sc.bundle_for("full", model, "logistic_regression", None)
    assert bundle["experimental"] is True
    assert bundle["verification"] == "unverified_dataset"
    assert bundle["candidate_status"] == "not_activated"
    assert bundle["labels"] == labels
    assert bundle["feature_contract"] == PHRASE_FEATURE_CONTRACT


def test_non_full_variants_carry_a_different_contract() -> None:
    from sklearn.linear_model import LogisticRegression

    X, y, _ = synthetic(classes=9)
    model = LogisticRegression(max_iter=500).fit(X, y)
    ablated = sc.bundle_for("presence_ablated", model, "logistic_regression", None)
    assert ablated["feature_contract"] != PHRASE_FEATURE_CONTRACT
    assert ablated["candidate_status"] == "experiment_only_not_servable"


def test_real_model_loader_refuses_non_full_variants_and_accepts_full(tmp_path: Path) -> None:
    from sklearn.linear_model import LogisticRegression

    X, y, _ = synthetic(classes=9)
    for variant, expect_loaded in (("full", True), ("presence_ablated", False), ("presence_only", False)):
        Xv = sc.transform(X, variant, np.arange(len(X)))
        model = LogisticRegression(max_iter=500).fit(Xv, y)
        path = tmp_path / f"{variant}.joblib"
        joblib.dump(sc.bundle_for(variant, model, "logistic_regression", None), path)
        recognizer = PhraseRecognizer(path, threshold=0.7)
        assert recognizer.available is expect_loaded, (variant, recognizer.error)


def test_sick_and_opinion_are_not_in_the_static_classes() -> None:
    assert "sick" not in sc.STATIC_CLASSES and "opinion" not in sc.STATIC_CLASSES
    assert len(sc.STATIC_CLASSES) == 9


def test_pooled_metrics_have_per_class_entries() -> None:
    y = np.array(sc.STATIC_CLASSES * 2)
    metrics = sc.pooled_metrics(y, y)
    assert set(metrics["per_class"]) == set(sc.STATIC_CLASSES)
    assert metrics["accuracy"] == 1.0


artifacts_present = pytest.mark.skipif(not (OUT / "training_report.json").is_file(),
                                       reason="static_v1 has not been generated")


@artifacts_present
def test_generated_report_covers_every_variant_and_algorithm() -> None:
    report = json.loads((OUT / "training_report.json").read_text(encoding="utf-8"))
    for algorithm in sc.ALGORITHMS:
        assert set(report["results"][algorithm]) >= set(sc.VARIANTS)
        assert len(report["shuffle_control"][algorithm]["runs"]) == 10
    assert set(report["presence_decodability"]) == set(sc.VARIANTS)


@artifacts_present
def test_generated_report_records_active_model_unchanged() -> None:
    report = json.loads((OUT / "training_report.json").read_text(encoding="utf-8"))
    config = report["config"]
    assert config["active_phrase_model_sha256_before"] == config["active_phrase_model_sha256_after"]
    assert config["active_phrase_model_sha256_after"] == sc.sha256_file(sc.ACTIVE_MODEL)


@artifacts_present
def test_no_candidate_file_uses_the_active_model_name() -> None:
    names = {p.name for p in OUT.iterdir()}
    assert "phrase_classifier.joblib" not in names


@artifacts_present
def test_model_card_states_status_and_limits() -> None:
    text = (OUT / "model_card.md").read_text(encoding="utf-8")
    assert "NOT activated" in text
    assert "NOT independent" in text
    assert "not real-world" in text.lower() or "NOT real-world" in text


@artifacts_present
def test_candidate_loads_through_live_loader_but_is_not_active() -> None:
    recognizer = PhraseRecognizer(OUT / "candidate_full.joblib", threshold=0.7)
    assert recognizer.available, recognizer.error
    assert recognizer.labels == sorted(sc.STATIC_CLASSES)
    assert recognizer.experimental is True


@artifacts_present
def test_candidate_predictions_are_finite_probabilities() -> None:
    bundle = joblib.load(OUT / "candidate_full.joblib")
    rng = np.random.default_rng(1)
    probe = rng.normal(size=(5, PHRASE_FEATURE_COUNT))
    proba = bundle["model"].predict_proba(probe)
    assert np.all(np.isfinite(proba))
    assert np.allclose(proba.sum(axis=1), 1.0)
