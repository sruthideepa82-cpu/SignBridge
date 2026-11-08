"""Feature normalization for one hand's 21 landmarks.

Used by the training scripts in ai-engine/ and by the live recognizer, so both see the same features.
The wrist is moved to the origin, and everything is scaled by the wrist-to-middle-knuckle distance in the
image plane. That makes the features independent of where the hand is and how close it is to the camera.
"""

import numpy as np

LANDMARK_COUNT = 21
WRIST = 0
MIDDLE_MCP = 9
FEATURE_COUNT = LANDMARK_COUNT * 3
_MIN_SCALE = 1e-6


def normalize_hand(points) -> np.ndarray:
    """Return 63 values: each landmark's (x, y, z) relative to the wrist and scaled by hand size."""
    array = np.asarray(points, dtype=float)
    if array.shape != (LANDMARK_COUNT, 3):
        raise ValueError(f"Expected {LANDMARK_COUNT} landmarks with x, y, z; got shape {array.shape}.")
    relative = array - array[WRIST]
    scale = float(np.linalg.norm(relative[MIDDLE_MCP, :2]))
    if scale < _MIN_SCALE:
        raise ValueError("Hand is too small or degenerate to normalize.")
    return (relative / scale).reshape(-1)
