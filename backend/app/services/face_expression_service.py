"""Facial expression estimates from MediaPipe face blendshapes.

Blendshapes are the 0-to-1 movement scores MediaPipe's Face Landmarker reports for named facial
movements (for example ``mouthSmileLeft``). Each expression below is a weighted mix of those scores.

These weights are a hand-written heuristic, not a trained or validated emotion model. The output is
an estimate of the expression that the face shows, not a statement about what the person feels.
The score returned with an expression is a heuristic strength (0 to 1), not a calibrated probability.

An expression is reported only when its strength reaches EXPRESSION_THRESHOLD. Otherwise the face is
reported as Neutral. The label is smoothed over recent frames so it does not flicker.
"""

from collections import Counter, deque
from collections.abc import Mapping
from dataclasses import dataclass

EXPRESSIONS = ("Happy", "Sad", "Angry", "Surprised", "Neutral")
EXPRESSION_THRESHOLD = 0.30
SMOOTHING_FRAMES = 9

Blendshapes = Mapping[str, float]


@dataclass(frozen=True)
class ExpressionEstimate:
    label: str
    strength: float
    scores: dict[str, float]


@dataclass(frozen=True)
class SmoothedExpression:
    label: str
    strength: float
    scores: dict[str, float]
    frames: int


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _mean(shapes: Blendshapes, names: tuple[str, ...]) -> float:
    return sum(shapes.get(name, 0.0) for name in names) / len(names)


def expression_scores(shapes: Blendshapes) -> dict[str, float]:
    """Heuristic strength of each non-neutral expression, each between 0 and 1."""
    smile = _mean(shapes, ("mouthSmileLeft", "mouthSmileRight"))
    frown = _mean(shapes, ("mouthFrownLeft", "mouthFrownRight"))
    brow_down = _mean(shapes, ("browDownLeft", "browDownRight"))
    press = _mean(shapes, ("mouthPressLeft", "mouthPressRight"))
    sneer = _mean(shapes, ("noseSneerLeft", "noseSneerRight"))
    brow_inner = shapes.get("browInnerUp", 0.0)
    brow_outer = _mean(shapes, ("browOuterUpLeft", "browOuterUpRight"))
    eye_wide = _mean(shapes, ("eyeWideLeft", "eyeWideRight"))
    jaw_open = shapes.get("jawOpen", 0.0)

    return {
        "Happy": _clamp(smile),
        "Sad": _clamp(0.7 * frown + 0.3 * brow_inner),
        "Angry": _clamp(0.5 * brow_down + 0.3 * press + 0.2 * sneer),
        "Surprised": _clamp(0.4 * eye_wide + 0.4 * jaw_open + 0.2 * brow_outer),
    }


def classify_expression(shapes: Blendshapes) -> ExpressionEstimate:
    scores = expression_scores(shapes)
    top = max(scores, key=lambda name: scores[name])
    if scores[top] >= EXPRESSION_THRESHOLD:
        label, strength = top, scores[top]
    else:
        label, strength = "Neutral", _clamp(1.0 - scores[top])
    scores["Neutral"] = _clamp(1.0 - max(scores.values()))
    return ExpressionEstimate(
        label=label,
        strength=round(strength, 3),
        scores={name: round(scores[name], 3) for name in EXPRESSIONS},
    )


class ExpressionSmoother:
    """Majority label over the last few frames. Strength is the mean of the frames that agree."""

    def __init__(self, frames: int = SMOOTHING_FRAMES) -> None:
        self._window: deque[ExpressionEstimate] = deque(maxlen=frames)

    def push(self, estimate: ExpressionEstimate) -> SmoothedExpression:
        self._window.append(estimate)
        counts = Counter(item.label for item in self._window)
        label = max(counts, key=lambda name: counts[name])
        strengths = [item.strength for item in self._window if item.label == label]
        return SmoothedExpression(
            label=label,
            strength=round(sum(strengths) / len(strengths), 3),
            scores=dict(estimate.scores),
            frames=len(self._window),
        )

    def reset(self) -> None:
        self._window.clear()
