"""Developer-only dataset collection tests.

The vocabulary used here is a test fixture in a temporary folder. It marks two classes as verified so that clips can
be saved and exported end to end. It is not the project's vocabulary and it does not mean any sign is verified.
"""

import csv
import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_DIR, Settings
from app.main import create_app

AI_ENGINE_DIR = BACKEND_DIR.parent / "ai-engine"


def write_fixture_vocabulary(path: Path) -> None:
    classes = [
        {"label": "C", "verified": True, "hands": 1, "reference": "fixture chart, cell C"},
        {"label": "A", "verified": False, "hands": 1, "reference": "fixture chart, cell A"},
        {"label": "H", "verified": True, "hands": 2, "reference": "fixture chart, cell H"},
    ]
    path.write_text(json.dumps({"classes": classes}), encoding="utf-8")


def make_settings(tmp_path: Path, enabled: bool = True) -> Settings:
    vocabulary = tmp_path / "vocabulary.json"
    write_fixture_vocabulary(vocabulary)
    return Settings(
        developer_tools_enabled=enabled,
        dataset_dir=tmp_path / "dataset",
        dataset_vocabulary_path=vocabulary,
        ai_engine_dir=AI_ENGINE_DIR,
        dataset_min_frames=10,
        dataset_max_frames=600,
    )


def hand(handedness: str, seed: int = 0, score: float = 0.95) -> dict:
    landmarks = [[round(0.01 * i + 0.001 * seed, 6), 0.2, 0.3] for i in range(21)]
    return {"handedness": handedness, "score": score, "landmarks": landmarks}


def clip_body(
    label: str = "C",
    participant: str = "P001",
    session: str = "S-A1",
    consent_ref: str = "C-2026-001",
    frames: int = 12,
    hands: tuple[str, ...] = ("Right",),
) -> dict:
    return {
        "label": label,
        "participant": participant,
        "consent_ref": consent_ref,
        "session": session,
        "frames": [
            {"t_ms": index * 100, "hands": [hand(name, seed=index) for name in hands]}
            for index in range(frames)
        ],
    }


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(make_settings(tmp_path)))


def test_routes_are_hidden_unless_developer_tools_are_enabled(tmp_path: Path) -> None:
    client = TestClient(create_app(make_settings(tmp_path, enabled=False)))

    assert client.get("/api/dataset/status").status_code == 404
    assert client.post("/api/dataset/clips", json=clip_body()).status_code == 404
    assert client.get("/api/dataset/export").status_code == 404


def test_status_lists_only_verified_classes_and_starts_empty(client: TestClient) -> None:
    body = client.get("/api/dataset/status").json()

    assert body["verified_labels"] == {"C": 1, "H": 2}
    assert "A" not in body["verified_labels"]
    assert body["total_clips"] == 0
    assert body["counts"] == {}


def test_a_verified_clip_is_saved_and_counted(client: TestClient, tmp_path: Path) -> None:
    response = client.post("/api/dataset/clips", json=clip_body())

    assert response.status_code == 200
    summary = response.json()
    assert summary["label"] == "C"
    assert summary["frame_count"] == 12
    assert summary["frames_with_hands"] == 12
    assert "frames" not in summary
    assert list((tmp_path / "dataset" / "clips" / "C").glob("*.json"))

    counts = client.get("/api/dataset/status").json()["counts"]["C"]
    assert counts == {"clips": 1, "frames": 12, "participants": 1, "sessions": 1}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"label": "A"}, "not a verified class"),
        ({"participant": "Sruthi"}, "pseudonym like P001"),
        ({"consent_ref": "x"}, "Consent reference"),
        ({"session": "a b"}, "Session ID"),
        ({"frames": 5}, "between 10 and 600"),
        ({"hands": ()}, "only 0 of 12 frames"),
        ({"hands": ("Left", "Right")}, "uses 1"),
    ],
)
def test_refuses_clips_that_break_the_collection_rules(client: TestClient, overrides: dict, message: str) -> None:
    response = client.post("/api/dataset/clips", json=clip_body(**overrides))

    assert response.status_code == 422
    assert message in response.json()["error"]["message"]


def test_two_handed_classes_accept_both_hands_and_reject_the_same_hand_twice(client: TestClient) -> None:
    assert client.post("/api/dataset/clips", json=clip_body(label="H", hands=("Left", "Right"))).status_code == 200

    response = client.post("/api/dataset/clips", json=clip_body(label="H", hands=("Right", "Right")))
    assert response.status_code == 422
    assert "same hand twice" in response.json()["error"]["message"]


def test_unknown_class_accepts_frames_with_no_valid_sign(client: TestClient) -> None:
    response = client.post("/api/dataset/clips", json=clip_body(label="UNKNOWN", hands=()))

    assert response.status_code == 200
    assert response.json()["frames_with_hands"] == 0


def test_rejects_landmarks_with_the_wrong_point_count(client: TestClient) -> None:
    body = clip_body()
    body["frames"][0]["hands"][0]["landmarks"] = body["frames"][0]["hands"][0]["landmarks"][:20]

    assert client.post("/api/dataset/clips", json=body).status_code == 422


def test_rejects_non_finite_landmark_values(client: TestClient) -> None:
    # Browsers cannot send NaN (JSON.stringify writes null), so the token is written into the body by hand.
    body = clip_body()
    body["frames"][3]["hands"][0]["landmarks"][0][0] = 123456.789
    raw = json.dumps(body).replace("123456.789", "NaN")

    response = client.post("/api/dataset/clips", content=raw, headers={"Content-Type": "application/json"})

    assert response.status_code == 422
    assert "not finite" in response.json()["error"]["message"]


def test_csv_export_has_one_row_per_frame_with_left_and_right_columns(client: TestClient) -> None:
    client.post("/api/dataset/clips", json=clip_body(label="C", session="S-A1", frames=12))
    client.post("/api/dataset/clips", json=clip_body(label="H", session="S-B1", frames=10, hands=("Left", "Right")))

    response = client.get("/api/dataset/export?format=csv")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 22
    assert {row["label"] for row in rows} == {"C", "H"}

    c_rows = [row for row in rows if row["label"] == "C"]
    assert c_rows[0]["right_present"] == "1"
    assert c_rows[0]["left_present"] == "0"
    assert c_rows[0]["left_0_x"] == ""
    assert c_rows[0]["right_1_x"] == "0.010000"
    assert c_rows[0]["right_20_z"] == "0.300000"
    assert [row["frame_index"] for row in c_rows] == [str(index) for index in range(12)]


def test_json_export_contains_every_clip_with_its_frames(client: TestClient) -> None:
    client.post("/api/dataset/clips", json=clip_body(label="C", session="S-A1"))
    client.post("/api/dataset/clips", json=clip_body(label="H", session="S-B1", hands=("Left", "Right")))

    body = json.loads(client.get("/api/dataset/export?format=json").text)

    assert body["schema"] == "signbridge-dataset/v1"
    assert body["clip_count"] == 2
    assert {clip["label"] for clip in body["clips"]} == {"C", "H"}
    h_clip = next(clip for clip in body["clips"] if clip["label"] == "H")
    assert {hand["handedness"] for hand in h_clip["frames"][0]["hands"]} == {"Left", "Right"}
    assert len(h_clip["frames"][0]["hands"][0]["landmarks"]) == 21
