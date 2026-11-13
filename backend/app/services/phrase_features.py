"""Feature contract for the daily-phrase classifier. Separate from the 63-feature alphabet contract.

One frame becomes a 131-value vector:

    [0:63]    normalize_hand() of the Left hand, zeros when it is not visible
    [63:126]  normalize_hand() of the Right hand, zeros when it is not visible
    [126:129] wrist offset (Right wrist - Left wrist) in hand-size units, zeros unless both hands are visible
    [129]     1.0 when the Left hand is visible
    [130]     1.0 when the Right hand is visible

Slots follow MediaPipe's handedness label. Each hand uses the same normalize_hand() as the alphabet model.
The offset keeps the relative position of two-hand signs, which normalize_hand() alone removes.

Training (ai-engine/training/phrase_recognition) and serving both call build_phrase_features(), so they cannot
drift apart.
"""

import numpy as np

from app.services.landmark_features import normalize_hand

PHRASE_FEATURE_CONTRACT = "phrase_v1_two_hand_131"
PHRASE_FEATURE_COUNT = 131
HAND_FEATURES = 63
WRIST = 0
MIDDLE_MCP = 9
LEFT_PRESENT = 129
RIGHT_PRESENT = 130


def build_phrase_features(landmarks, present) -> np.ndarray | None:
    """landmarks: array-like (2, 21, 3), slot 0 = Left and slot 1 = Right. present: (2,) booleans.

    Returns None when no hand is usable, so the caller can report that instead of guessing.
    """
    points = np.asarray(landmarks, dtype=np.float64)
    vector = np.zeros(PHRASE_FEATURE_COUNT, dtype=np.float64)
    usable = []
    for slot in range(2):
        if not present[slot]:
            continue
        try:
            hand = normalize_hand(points[slot])
        except ValueError:
            continue
        vector[slot * HAND_FEATURES : (slot + 1) * HAND_FEATURES] = hand
        vector[LEFT_PRESENT + slot] = 1.0
        usable.append(slot)
    if not usable:
        return None
    if len(usable) == 2:
        left, right = points[0], points[1]
        scale = float(np.linalg.norm(left[MIDDLE_MCP, :2] - left[WRIST, :2]))
        vector[126:129] = (right[WRIST] - left[WRIST]) / scale
    return vector
