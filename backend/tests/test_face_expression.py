from app.services.face_expression_service import (
    EXPRESSION_THRESHOLD,
    ExpressionSmoother,
    classify_expression,
    expression_scores,
)


def test_a_relaxed_face_is_neutral() -> None:
    estimate = classify_expression({})

    assert estimate.label == "Neutral"
    assert estimate.scores["Neutral"] == 1.0
    assert all(estimate.scores[name] == 0.0 for name in ("Happy", "Sad", "Angry", "Surprised"))


def test_a_clear_smile_is_happy() -> None:
    estimate = classify_expression({"mouthSmileLeft": 0.8, "mouthSmileRight": 0.7})

    assert estimate.label == "Happy"
    assert estimate.strength == 0.75


def test_frowning_with_raised_inner_brows_is_sad() -> None:
    estimate = classify_expression({"mouthFrownLeft": 0.6, "mouthFrownRight": 0.6, "browInnerUp": 0.5})

    assert estimate.label == "Sad"


def test_lowered_brows_and_pressed_lips_are_angry() -> None:
    estimate = classify_expression(
        {"browDownLeft": 0.8, "browDownRight": 0.8, "mouthPressLeft": 0.6, "mouthPressRight": 0.6}
    )

    assert estimate.label == "Angry"


def test_wide_eyes_and_open_jaw_are_surprised() -> None:
    estimate = classify_expression({"eyeWideLeft": 0.9, "eyeWideRight": 0.9, "jawOpen": 0.8})

    assert estimate.label == "Surprised"


def test_a_weak_movement_below_the_threshold_stays_neutral() -> None:
    weak_smile = {"mouthSmileLeft": EXPRESSION_THRESHOLD - 0.1, "mouthSmileRight": EXPRESSION_THRESHOLD - 0.1}

    estimate = classify_expression(weak_smile)

    assert estimate.label == "Neutral"
    assert estimate.scores["Happy"] < EXPRESSION_THRESHOLD


def test_scores_come_only_from_the_blendshapes_given() -> None:
    assert expression_scores({"mouthSmileLeft": 1.0, "mouthSmileRight": 1.0})["Happy"] == 1.0
    assert expression_scores({"mouthSmileLeft": 1.0})["Happy"] == 0.5


def test_smoother_reports_the_majority_label_over_recent_frames() -> None:
    smoother = ExpressionSmoother(frames=5)
    happy = classify_expression({"mouthSmileLeft": 0.8, "mouthSmileRight": 0.8})
    neutral = classify_expression({})

    for _ in range(3):
        last = smoother.push(happy)
    assert last.label == "Happy"

    for _ in range(4):
        last = smoother.push(neutral)
    assert last.label == "Neutral"
    assert last.frames == 5


def test_smoother_reset_clears_history() -> None:
    smoother = ExpressionSmoother(frames=5)
    smoother.push(classify_expression({"mouthSmileLeft": 0.8, "mouthSmileRight": 0.8}))

    smoother.reset()
    result = smoother.push(classify_expression({}))

    assert result.frames == 1
    assert result.label == "Neutral"
