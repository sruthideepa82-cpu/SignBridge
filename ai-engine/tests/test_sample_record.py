import json
import sys
from pathlib import Path

import pytest

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ENGINE_DIR / "collection"))

import collect_static  # noqa: E402
from sample_record import (  # noqa: E402
    accept_hands,
    build_sample,
    validate_consent_ref,
    validate_participant,
    verified_classes,
)


def hand(handedness: str = "Right", score: float = 0.95, points: int = 21) -> dict:
    return {
        "handedness": handedness,
        "score": score,
        "landmarks": [(0.1 * i, 0.2, -0.01) for i in range(points)],
    }


def test_participant_must_be_pseudonym() -> None:
    assert validate_participant("P001") == "P001"
    for bad in ["Ravi", "p001", "P1", "P0001", "P001 "]:
        with pytest.raises(ValueError):
            validate_participant(bad)


def test_consent_reference_rejects_names_and_spaces() -> None:
    assert validate_consent_ref("C-2026-001") == "C-2026-001"
    for bad in ["", "ab", "Ravi Kumar", "C/2026"]:
        with pytest.raises(ValueError):
            validate_consent_ref(bad)


def test_only_verified_classes_with_reference_are_usable() -> None:
    vocabulary = {
        "classes": [
            {"label": "GOOD", "verified": True, "reference": "ISLRTC-DICT p.12", "hands": 1},
            {"label": "NOREF", "verified": True, "reference": "", "hands": 1},
            {"label": "UNCHECKED", "verified": False, "reference": "ISLRTC-DICT", "hands": 1},
        ]
    }

    assert set(verified_classes(vocabulary)) == {"GOOD"}


def test_shipped_vocabulary_has_the_six_poster_checked_one_handed_letters() -> None:
    vocabulary = json.loads((AI_ENGINE_DIR / "dataset" / "metadata" / "vocabulary.json").read_text("utf-8"))

    usable = verified_classes(vocabulary)
    assert set(usable) == {"C", "L", "O", "S", "U", "V"}
    assert all(entry["hands"] == 1 for entry in usable.values())
    assert all(entry["signer_confirmed"] is False for entry in usable.values())


def test_accepts_exact_hand_count_with_full_landmarks_and_confidence() -> None:
    assert accept_hands([hand()], expected_hands=1, min_score=0.8)
    assert accept_hands([hand("Left"), hand("Right")], expected_hands=2, min_score=0.8)


@pytest.mark.parametrize(
    "hands, expected",
    [
        ([], 1),
        ([hand()], 2),
        ([hand(), hand()], 1),
        ([hand(score=0.5)], 1),
        ([hand(points=20)], 1),
        ([hand(handedness="Unknown")], 1),
    ],
)
def test_rejects_frames_that_do_not_match_the_class(hands: list, expected: int) -> None:
    assert not accept_hands(hands, expected_hands=expected, min_score=0.8)


def test_sample_holds_only_coordinates_and_metadata() -> None:
    sample = build_sample(
        label="GOOD",
        participant="P001",
        session_id="20261108-140502",
        sample_index=0,
        captured_at="2026-11-08T14:05:02.123",
        hands=[hand(score=0.912345678)],
    )

    assert set(sample) == {"label", "participant", "session", "sample_index", "captured_at", "hands"}
    assert sample["hands"][0]["score"] == 0.9123
    assert len(sample["hands"][0]["landmarks"]) == 21
    assert all(len(point) == 3 for point in sample["hands"][0]["landmarks"])
    json.dumps(sample)


def test_cli_refuses_unverified_label_without_touching_camera(tmp_path: Path, monkeypatch) -> None:
    vocabulary = tmp_path / "vocabulary.json"
    vocabulary.write_text(json.dumps({"classes": []}), encoding="utf-8")

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("camera must not open for an unverified label")

    monkeypatch.setattr(collect_static, "open_default_capture", fail_if_called)

    code = collect_static.main(
        [
            "--label",
            "GOOD",
            "--participant",
            "P001",
            "--consent-ref",
            "C-2026-001",
            "--vocabulary",
            str(vocabulary),
            "--output",
            str(tmp_path / "raw"),
        ]
    )

    assert code == 2
    assert not (tmp_path / "raw").exists()


def test_cli_rejects_non_pseudonym_before_anything_else(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        collect_static.main(
            [
                "--label",
                "GOOD",
                "--participant",
                "Ravi",
                "--consent-ref",
                "C-2026-001",
                "--vocabulary",
                str(tmp_path / "missing.json"),
            ]
        )
