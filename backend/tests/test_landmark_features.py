import numpy as np
import pytest

from app.services.landmark_features import FEATURE_COUNT, normalize_hand


def sample_hand() -> np.ndarray:
    rng = np.random.default_rng(3)
    points = rng.uniform(0.2, 0.8, size=(21, 3))
    points[:, 2] *= 0.1
    return points


def test_output_has_63_finite_values() -> None:
    features = normalize_hand(sample_hand())

    assert features.shape == (FEATURE_COUNT,)
    assert np.all(np.isfinite(features))


def test_wrist_is_at_origin_and_middle_knuckle_has_unit_planar_length() -> None:
    features = normalize_hand(sample_hand()).reshape(21, 3)

    assert np.allclose(features[0], 0.0)
    assert np.isclose(np.linalg.norm(features[9, :2]), 1.0)


def test_invariant_to_translation_and_image_scale() -> None:
    base = sample_hand()
    moved_and_scaled = base * 2.5 + np.array([0.1, -0.05, 0.0])

    assert np.allclose(normalize_hand(base), normalize_hand(moved_and_scaled))


def test_rejects_wrong_landmark_count() -> None:
    with pytest.raises(ValueError):
        normalize_hand(np.zeros((20, 3)))


def test_rejects_degenerate_hand() -> None:
    with pytest.raises(ValueError):
        normalize_hand(np.zeros((21, 3)))
