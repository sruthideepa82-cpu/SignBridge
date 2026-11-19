"""Dynamic 28-phrase experiment (v2): feature, split, leakage, permutation and artifact tests.
Everything here is WITHIN_CLIP_EXPERIMENTAL_NOT_INDEPENDENT. Nothing is activated or connected to live recognition."""

import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pytest

AI_ENGINE = Path(__file__).resolve().parents[1]
REPO = AI_ENGINE.parent
EXP = AI_ENGINE / "training" / "phrase_experiments" / "dynamic_v2"
sys.path.insert(0, str(EXP))
sys.path.insert(0, str(REPO / "backend"))

import train_dynamic_v2 as exp  # noqa: E402
from app.services.phrase_features import PHRASE_FEATURE_CONTRACT  # noqa: E402
from app.services.phrase_recognizer import PhraseRecognizer  # noqa: E402

OUT = exp.OUT
LABEL = "WITHIN_CLIP_EXPERIMENTAL_NOT_INDEPENDENT"


def synthetic_item(left_on: bool, right_on: bool, seed: int = 0, wrist_path: float = 1.5) -> dict:
    rng = np.random.default_rng(seed)
    per_frame = np.zeros((32, exp.PER_FRAME))
    if left_on:
        per_frame[:, exp.LEFT] = rng.uniform(0.1, 1.0, size=(32, 63))
    if right_on:
        per_frame[:, exp.RIGHT] = rng.uniform(0.1, 1.0, size=(32, 63))
    return {"per_frame": per_frame, "motion_wrist_path": wrist_path}


def test_aggregate_has_the_documented_dimension_and_is_finite() -> None:
    vector = exp.aggregate(synthetic_item(True, True))
    assert vector.shape == (exp.AGGREGATE_DIM,)
    assert exp.AGGREGATE_DIM == 569
    assert np.all(np.isfinite(vector))


def test_aggregate_mean_block_matches_numpy() -> None:
    item = synthetic_item(True, True, seed=3)
    vector = exp.aggregate(item)
    assert np.allclose(vector[:exp.PER_FRAME], item["per_frame"].mean(0))
    assert np.allclose(vector[exp.PER_FRAME:2 * exp.PER_FRAME], item["per_frame"].std(0))


def test_presence_statistics_for_a_one_hand_window() -> None:
    vector = exp.aggregate(synthetic_item(True, False))
    left_frac, right_frac, both_frac, transitions = vector[4 * exp.PER_FRAME:4 * exp.PER_FRAME + 4]
    assert left_frac == 1.0 and right_frac == 0.0 and both_frac == 0.0 and transitions == 0
    assert vector[-1] == pytest.approx(1.5)


def test_presence_transitions_are_counted() -> None:
    item = synthetic_item(True, False)
    item["per_frame"][::2, exp.LEFT] = 0.0
    vector = exp.aggregate(item)
    assert vector[4 * exp.PER_FRAME + 3] == 31


def test_split_holds_out_the_extreme_starts_and_covers_every_window() -> None:
    starts = np.tile(np.arange(9), 28)
    train, held = exp.split(starts)
    assert set(starts[held].tolist()) == {0, 8}
    assert set(starts[train].tolist()) == set(range(1, 8))
    assert len(set(train.tolist()) & set(held.tolist())) == 0
    assert len(train) + len(held) == len(starts)


def test_overlap_between_windows_is_exact() -> None:
    assert exp.overlap_frames(0, 0) == 32
    assert exp.overlap_frames(0, 1) == 31
    assert exp.overlap_frames(0, 8) == 24
    assert exp.overlap_frames(0, 32) == 0


def test_leakage_report_reports_the_nearest_shared_frames() -> None:
    starts = np.tile(np.arange(9), 2)
    train, held = exp.split(starts)
    report = exp.leakage_report(starts, train, held)
    assert report["min_shared_frames_with_nearest_training_window"] == 31
    assert report["max_shared_frames_with_nearest_training_window"] == 31


def test_permuted_clip_labels_are_a_bijection_and_deterministic() -> None:
    labels = sorted(f"phrase{i:02d}" for i in range(28))
    first = exp.permuted_clip_labels(np.array(labels), labels, seed=4)
    second = exp.permuted_clip_labels(np.array(labels), labels, seed=4)
    assert first == second
    assert sorted(first.keys()) == labels
    assert sorted(first.values()) == labels
    assert exp.permuted_clip_labels(np.array(labels), labels, seed=5) != first


def test_summarise_gives_mean_and_spread() -> None:
    s = exp.summarise([0.0, 1.0, 1.0])
    assert s["mean"] == pytest.approx(2 / 3)
    assert s["min"] == 0.0 and s["max"] == 1.0 and s["n"] == 3


def test_candidate_fit_is_reproducible_on_synthetic_data() -> None:
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    rng = np.random.default_rng(7)
    X = rng.normal(size=(60, 20))
    y = np.repeat(np.arange(3), 20)
    a = make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000)).fit(X, y).predict_proba(X)
    b = make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000)).fit(X, y).predict_proba(X)
    assert np.array_equal(a, b)


def test_real_windows_have_the_expected_shape_when_data_present() -> None:
    manifest = AI_ENGINE / "dataset" / "public" / "isl_phrases" / "v2" / "phrase_manifest.csv"
    if not manifest.is_file():
        pytest.skip("Stage 0 manifest not present")
    X, y, starts, phrases = exp.load_windows()
    assert X.shape == (252, 569)
    assert len(set(y.tolist())) == 28 == len(phrases)
    assert np.all(np.isfinite(X))
    assert sorted(set(starts.tolist())) == list(range(9))


artifacts = pytest.mark.skipif(not (OUT / "training_report.json").is_file(), reason="dynamic_v2 not generated")


@artifacts
def test_config_records_the_label_protected_status_and_no_threshold() -> None:
    config = json.loads((OUT / "experiment_config.json").read_text(encoding="utf-8"))
    assert config["label"] == LABEL
    assert config["status"] == "experiment_only_not_servable"
    assert config["threshold"] is None
    assert config["protected_files_unchanged"] is True
    assert config["feature_contract"] != PHRASE_FEATURE_CONTRACT


@artifacts
def test_candidate_bundle_loads_with_sorted_labels_and_valid_probabilities() -> None:
    bundle = joblib.load(OUT / "candidate_logistic_regression.joblib")
    labels = sorted(exp.load_windows()[3]) if (REPO / "ai-engine" / "dataset" / "public" / "isl_phrases" / "v2" / "phrase_manifest.csv").is_file() else None
    assert bundle["labels"] == sorted(bundle["labels"]) and len(bundle["labels"]) == 28
    if labels is not None:
        assert bundle["labels"] == labels
    assert bundle["experimental"] is True
    assert bundle["verification"] == "unverified_dataset"
    rng = np.random.default_rng(2)
    probe = rng.normal(size=(4, exp.AGGREGATE_DIM))
    proba = bundle["model"].predict_proba(probe)
    assert np.all(np.isfinite(proba))
    assert np.allclose(proba.sum(axis=1), 1.0)


@artifacts
def test_live_recognizer_refuses_the_candidate() -> None:
    recognizer = PhraseRecognizer(OUT / "candidate_logistic_regression.joblib", threshold=0.7)
    assert recognizer.available is False
    assert "feature contract" in (recognizer.error or "") or "features" in (recognizer.error or "")


@artifacts
def test_reports_carry_the_within_clip_label_and_no_accuracy_claim() -> None:
    text = (OUT / "evaluation_report.md").read_text(encoding="utf-8")
    assert LABEL in text
    assert "not real-world recognition performance" in text
    card = (OUT / "model_card.md").read_text(encoding="utf-8")
    assert LABEL in card and "NOT activated" in card


@artifacts
def test_permutation_control_is_at_chance_and_below_the_real_score() -> None:
    report = json.loads((OUT / "training_report.json").read_text(encoding="utf-8"))
    control = report["results"]["shuffle_control"]["logistic_regression"]["accuracy_with_permuted_clip_labels"]
    real = report["results"]["models"]["logistic_regression"]["held_out_leaky"]["accuracy"]
    assert control["n"] == 10
    assert control["mean"] < real


@artifacts
def test_no_active_or_stage_artifact_was_overwritten() -> None:
    assert not (OUT / "phrase_classifier.joblib").exists()
    assert hashlib.sha256((REPO / "ai-engine/models/phrase_classifier.joblib").read_bytes()).hexdigest() == \
        "ecb20d58dec82ee2c994f2b65def4e202a08fa8f150baa06bcc80331e39842aa"
    config = json.loads((OUT / "experiment_config.json").read_text(encoding="utf-8"))
    for path, digest in config["protected_hashes_after"].items():
        assert hashlib.sha256((REPO / path).read_bytes()).hexdigest() == digest
