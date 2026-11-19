"""Stage 2 dynamic prototype: sequence preparation, feature split, DTW and rejection tests. Isolated; no live code."""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

AI_ENGINE = Path(__file__).resolve().parents[1]
REPO = AI_ENGINE.parent
DYNAMIC = AI_ENGINE / "training" / "phrase_experiments" / "dynamic"
sys.path.insert(0, str(DYNAMIC))
sys.path.insert(0, str(REPO / "backend"))

import evaluate_dtw as ev  # noqa: E402
import prepare_sequences as prep  # noqa: E402

CANDIDATE = REPO / "ai-engine" / "models" / "phrase_candidates" / "dynamic_v1"
STATIC_CANDIDATE = REPO / "ai-engine" / "models" / "phrase_candidates" / "static_v1"


def synthetic_clip(seed: int = 0, present: bool = True):
    rng = np.random.default_rng(seed)
    frames = np.zeros((40, 2, 21, 3))
    base = rng.uniform(0.3, 0.7, size=(21, 3))
    frames[:, 0] = base + np.linspace(0, 0.2, 40)[:, None, None] * np.array([1, 0, 0])
    if present:
        frames[:, 1] = base + 0.1
    return frames


def test_windows_are_stride_one_ordered_and_contiguous() -> None:
    clip = {"frames": synthetic_clip(), "present": np.ones((40, 2), bool),
            "frame_numbers": list(range(1, 41)), "nonfinite_inputs": 0}
    windows = prep.make_windows("x", clip, "dynamic")
    assert len(windows) == 9
    assert [w["start"] for w in windows] == list(range(9))
    for w in windows:
        assert w["frame_numbers"] == list(range(w["start"] + 1, w["start"] + 33))
        assert w["frames"].shape == (32, 2, 21, 3)


def test_feature_function_is_imported_and_shapes_match_contract() -> None:
    module = prep.load_features_module()
    assert Path(module.__file__).resolve() == (REPO / "signbridge_training" / "features.py").resolve()
    rng = np.random.default_rng(1)
    window = rng.uniform(0.2, 0.8, size=(32, 2, 21, 3)).astype(np.float32)
    flat = module.features(window[None])[0]
    assert flat.shape == (4512,)
    per_frame = prep.per_frame_from_flat(flat)
    assert per_frame.shape == (32, prep.PER_FRAME_DIM)


def test_per_frame_split_reconstructs_the_flat_vector_exactly() -> None:
    module = prep.load_features_module()
    rng = np.random.default_rng(2)
    window = rng.uniform(0.2, 0.8, size=(32, 2, 21, 3)).astype(np.float32)
    flat = module.features(window[None])[0].astype(np.float64)
    per = prep.per_frame_from_flat(flat)
    rebuilt = np.concatenate([
        per[:, 0:126].reshape(-1),
        per[:, 126:132].reshape(-1),
        per[:, 132:138].reshape(-1),
        per[:, 138:141].reshape(-1),
    ])
    assert np.array_equal(rebuilt, flat)


def test_missing_left_hand_is_zero_in_every_block() -> None:
    module = prep.load_features_module()
    window = np.zeros((32, 2, 21, 3), dtype=np.float32)
    window[:, 1] = np.random.default_rng(3).uniform(0.2, 0.8, size=(32, 21, 3))
    flat = module.features(window[None])[0].astype(np.float64)
    per = prep.per_frame_from_flat(flat)
    assert np.all(per[:, 0:63] == 0)
    assert np.all(per[:, 126:129] == 0)
    assert np.all(per[:, 132:135] == 0)
    assert np.any(per[:, 63:126] != 0)


def test_invalid_landmarks_become_absent_hands_and_are_reported() -> None:
    rows = []
    for n in range(1, 41):
        rows.append({"phrase_label": "p", "frame_number": str(n), "source_file": f"{n}.png",
                     "training_eligibility": "dynamic_sequence_member", "landmarks_row": str(n - 1)})
    landmarks = np.full((40, 2, 21, 3), np.nan, dtype=np.float32)
    landmarks[:20, 0] = 0.5
    clips = prep.load_clips(rows, landmarks, ["p"])
    clip = clips["p"]
    assert not clip["present"][25, 0] and clip["present"][5, 0]
    assert np.all(np.isfinite(clip["frames"]))
    assert clip["nonfinite_inputs"] == 0
    windows = prep.make_windows("p", clip, "dynamic")
    assert int(windows[0]["present"][:, 0].sum()) == 20


def test_insufficient_hand_frames_are_excluded_with_a_reason() -> None:
    module = prep.load_features_module()
    frames = np.zeros((32, 2, 21, 3))
    present = np.zeros((32, 2), dtype=bool)
    frames[:5, 0] = 0.5
    present[:5, 0] = True
    window = {"phrase": "p", "group": "dynamic", "start": 0, "frame_numbers": list(range(1, 33)),
              "frames": frames, "present": present, "nonfinite_inputs": 0}
    item = prep.featurise(module.features, window)
    assert item["eligible"] is False
    assert "hands in 5/32" in item["exclusion_reason"]


def test_hand_size_anomaly_is_detected() -> None:
    module = prep.load_features_module()
    frames = np.zeros((32, 2, 21, 3))
    frames[:, 0] = 0.5
    frames[:, 0, 9, 0] = 0.5005
    present = np.ones((32, 2), dtype=bool)
    present[:, 1] = False
    window = {"phrase": "p", "group": "dynamic", "start": 0, "frame_numbers": list(range(1, 33)),
              "frames": frames, "present": present, "nonfinite_inputs": 0}
    item = prep.featurise(module.features, window)
    assert item["hand_size_anomalies"] == 32


def test_dtw_vectorised_matches_naive_reference() -> None:
    rng = np.random.default_rng(4)
    query = rng.normal(size=(12, 5))
    bank = rng.normal(size=(6, 12, 5))
    fast = ev.dtw_to_bank(query, bank)
    slow = np.array([ev.dtw_naive(query, b) for b in bank])
    assert np.allclose(fast, slow, atol=1e-10)


def test_dtw_identical_sequences_have_zero_distance_and_are_symmetric() -> None:
    rng = np.random.default_rng(5)
    a = rng.normal(size=(10, 4))
    b = rng.normal(size=(10, 4))
    assert ev.dtw_naive(a, a) == pytest.approx(0.0)
    assert ev.dtw_naive(a, b) == pytest.approx(ev.dtw_naive(b, a))


def test_dtw_tolerates_a_time_shift_better_than_pointwise_distance() -> None:
    t = np.linspace(0, 2 * np.pi, 32)
    a = np.stack([np.sin(t), np.cos(t)], axis=1)
    b = np.roll(a, 2, axis=0)
    pointwise = np.linalg.norm(a - b, axis=1).mean() / 2
    assert ev.dtw_naive(a, b) < pointwise


def test_assess_accepts_rejects_and_flags_ambiguity() -> None:
    labels = np.array(["x", "x", "y", "z"])
    threshold = 1.0
    far = np.array([[np.inf, np.inf, 5.0, 6.0]])
    ambiguous = np.array([[np.inf, np.inf, 0.5, 0.52]])
    clear = np.array([[np.inf, np.inf, 0.2, 0.9]])
    assert ev.assess(far, ["q"], labels, threshold)[0]["status"] == "rejected"
    assert ev.assess(ambiguous, ["q"], labels, threshold)[0]["status"] == "ambiguous"
    accepted = ev.assess(clear, ["q"], labels, threshold)[0]
    assert accepted["status"] == "accepted" and accepted["predicted_phrase"] == "y"


def test_nearest_other_ignores_same_clip_windows() -> None:
    D = np.array([[0.0, 0.01, 2.0], [0.01, 0.0, 3.0], [2.0, 3.0, 0.0]])
    labels = np.array(["a", "a", "b"])
    assert ev.nearest_other_distances(D, labels).tolist() == [2.0, 3.0, 2.0]


def test_pairwise_distance_matrix_is_reproducible() -> None:
    rng = np.random.default_rng(6)
    bank = rng.normal(size=(5, 8, 3))
    assert np.array_equal(ev.pairwise(bank), ev.pairwise(bank))


def test_reference_bank_has_the_documented_shape_when_present() -> None:
    bank_path = CANDIDATE / "reference_bank.npz"
    if not bank_path.is_file():
        pytest.skip("dynamic_v1 has not been generated")
    data = np.load(bank_path, allow_pickle=False)
    assert data["per_frame"].shape == (252, 32, 141)
    assert len(set(data["labels"].tolist())) == 28
    assert np.all(np.isfinite(data["per_frame"]))


def test_no_protected_directory_was_created_or_altered() -> None:
    assert not (REPO / "signbridge_training" / "model").exists()
    assert not any(p.name == "model.joblib" for p in (REPO / "signbridge_training").iterdir())
    if CANDIDATE.exists():
        assert not any(p.suffix == ".joblib" for p in CANDIDATE.iterdir())


def test_active_phrase_model_is_unchanged() -> None:
    active = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
    assert hashlib.sha256(active.read_bytes()).hexdigest() == \
        "ecb20d58dec82ee2c994f2b65def4e202a08fa8f150baa06bcc80331e39842aa"


def test_static_candidate_was_not_overwritten_by_stage_two() -> None:
    report_path = STATIC_CANDIDATE / "training_report.json"
    if not report_path.is_file():
        pytest.skip("static_v1 has not been generated")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    recorded = report["config"]["artifacts"]["full"]["sha256"]
    actual = hashlib.sha256((STATIC_CANDIDATE / "candidate_full.joblib").read_bytes()).hexdigest()
    assert recorded == actual


def test_dtw_config_marks_the_prototype_not_activated() -> None:
    config_path = CANDIDATE / "dtw_config.json"
    if not config_path.is_file():
        pytest.skip("dynamic_v1 has not been generated")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    assert config["status"] == "not_activated"
    assert config["experimental"] is True
    assert config["window_frames"] == 32
    assert config["feature_source"].startswith("signbridge_training/features.py")
