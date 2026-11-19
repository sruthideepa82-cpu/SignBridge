"""Dataset Collection Studio (Stage 5B): local-only API, consent flow, flag enforcement and camera isolation.
All requests go to a temporary database. No recording is created."""

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.studio import gate

REPO = Path(__file__).resolve().parents[2]
LOCAL = {"x-studio-client": "studio"}
ACTIVE_MODEL_SHA = "ecb20d58dec82ee2c994f2b65def4e202a08fa8f150baa06bcc80331e39842aa"


class ExplodingCamera:
    """Fails loudly if the Studio ever touches the camera."""

    def __getattr__(self, name: str):
        raise AssertionError(f"the Studio must not use the camera service ({name})")


@pytest.fixture(autouse=True)
def recording_flag_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(gate.RECORDING_FLAG, raising=False)


@pytest.fixture
def app(tmp_path: Path, settings: Settings):
    application = create_app(settings=settings, camera_service=ExplodingCamera())
    application.state.studio_db_path = tmp_path / "api.sqlite3"
    return application


def local_client(app) -> TestClient:
    return TestClient(app, client=("127.0.0.1", 50000), base_url="http://127.0.0.1:8000")


def granted_body(consent_id: str = "C-2026-001") -> dict:
    return {"consent_id": consent_id, "status": "granted", "form_version": "v1", "scope_landmarks": True,
            "document_ref": "Form v1 signed 2026-11-20", "authorized_by": "REV-01", "note": ""}


# Local-only access ----------------------------------------------------------------------------------------------

def test_remote_client_is_refused(app) -> None:
    client = TestClient(app, client=("203.0.113.9", 50000), base_url="http://127.0.0.1:8000")
    response = client.get("/api/studio/status", headers=LOCAL)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "studio_forbidden"


def test_spoofed_host_header_is_refused(app) -> None:
    client = TestClient(app, client=("127.0.0.1", 50000), base_url="http://evil.example")
    assert client.get("/api/studio/status", headers=LOCAL).status_code == 403


def test_missing_studio_header_is_refused(app) -> None:
    assert local_client(app).get("/api/studio/status").status_code == 403


def test_cross_site_style_request_without_the_header_is_refused(app) -> None:
    response = local_client(app).post("/api/studio/participants", json={"participant_code": "P001"})
    assert response.status_code == 403


def test_ipv6_loopback_is_accepted(app) -> None:
    client = TestClient(app, client=("::1", 50000), base_url="http://[::1]:8000")
    assert client.get("/api/studio/status", headers=LOCAL).status_code == 200


# Flag and status ----------------------------------------------------------------------------------------------------

def test_status_reports_collection_disabled_by_default(app) -> None:
    body = local_client(app).get("/api/studio/status", headers=LOCAL).json()
    assert body["participant_collection"] == "disabled"
    assert body["recording_enabled"] is False
    assert "PARTICIPANT COLLECTION DISABLED" in body["message"]
    assert body["schema_version"] == 1


def test_status_reports_enabled_only_for_the_exact_flag_value(app, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(gate.RECORDING_FLAG, "TRUE")
    assert local_client(app).get("/api/studio/status", headers=LOCAL).json()["recording_enabled"] is False
    monkeypatch.setenv(gate.RECORDING_FLAG, "true")
    assert local_client(app).get("/api/studio/status", headers=LOCAL).json()["recording_enabled"] is True


def test_committed_configuration_keeps_the_flag_false() -> None:
    for path in (REPO / "backend" / ".env.example", REPO / "backend" / "app" / "core" / "config.py"):
        if path.exists():
            assert "SIGNBRIDGE_STUDIO_RECORDING_ENABLED=true" not in path.read_text(encoding="utf-8")


# Participants and consent ----------------------------------------------------------------------------------------

def test_participant_registration_and_listing(app) -> None:
    client = local_client(app)
    assert client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL).status_code == 201
    listed = client.get("/api/studio/participants", headers=LOCAL).json()
    assert [p["participant_code"] for p in listed] == ["P001"]
    assert listed[0]["consent_status"] is None


def test_names_are_refused_as_participant_codes(app) -> None:
    response = local_client(app).post("/api/studio/participants", json={"participant_code": "Asha"}, headers=LOCAL)
    assert response.status_code == 422


def test_duplicate_participant_is_a_conflict(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    assert client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL).status_code == 409


def test_granted_consent_and_participant_detail(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    response = client.post("/api/studio/participants/P001/consents", json=granted_body(), headers=LOCAL)
    assert response.status_code == 201
    detail = client.get("/api/studio/participants/P001", headers=LOCAL).json()
    assert detail["consent_status"] == "granted"
    assert detail["consents"][0]["research_use"] == "internal_research_only"
    assert detail["consents"][0]["scope_landmarks"] is True


def test_granting_without_landmark_scope_is_refused(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    body = granted_body()
    body["scope_landmarks"] = False
    assert client.post("/api/studio/participants/P001/consents", json=body, headers=LOCAL).status_code == 422


def test_granting_without_a_reviewer_is_refused(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    body = granted_body()
    body["authorized_by"] = None
    assert client.post("/api/studio/participants/P001/consents", json=body, headers=LOCAL).status_code == 422


def test_document_path_is_refused(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    body = granted_body()
    body["document_ref"] = "../../forms/signed.pdf"
    assert client.post("/api/studio/participants/P001/consents", json=body, headers=LOCAL).status_code == 422


def test_consent_for_unknown_participant_is_not_found(app) -> None:
    response = local_client(app).post("/api/studio/participants/P050/consents", json=granted_body(), headers=LOCAL)
    assert response.status_code == 404


def test_withdrawal_flow_through_the_api(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    client.post("/api/studio/participants/P001/consents", json=granted_body(), headers=LOCAL)
    response = client.post(
        "/api/studio/participants/P001/consents/withdraw",
        json={"consent_id": "C-2026-002", "document_ref": "Withdrawal letter 2026-12-01", "note": ""},
        headers=LOCAL,
    )
    assert response.status_code == 201
    assert response.json()["supersedes_consent_id"] == "C-2026-001"
    assert client.get("/api/studio/participants/P001", headers=LOCAL).json()["consent_status"] == "withdrawn"


def test_consent_listing_has_no_document_content(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    client.post("/api/studio/participants/P001/consents", json=granted_body(), headers=LOCAL)
    rows = client.get("/api/studio/consents", headers=LOCAL).json()
    assert rows and set(rows[0]).isdisjoint({"document_content", "file_path", "signature"})


# Phrases and the eligibility check -------------------------------------------------------------------------------

def test_every_dynamic_phrase_is_listed_as_blocked(app) -> None:
    phrases_body = local_client(app).get("/api/studio/phrases", headers=LOCAL).json()
    assert len(phrases_body) == 28
    assert all(p["recording_blocked"] for p in phrases_body)


def test_recording_check_is_refused_and_audited_and_never_eligible(app) -> None:
    client = local_client(app)
    client.post("/api/studio/participants", json={"participant_code": "P001"}, headers=LOCAL)
    client.post("/api/studio/participants/P001/consents", json=granted_body(), headers=LOCAL)
    body = client.post(
        "/api/studio/recording-checks",
        json={"participant_code": "P001", "consent_ref": "C-2026-001", "phrase_id": "DYN-01"},
        headers=LOCAL,
    ).json()
    assert body["eligible"] is False
    codes = {r["code"] for r in body["reasons"]}
    assert {"phrase_unverified", "recording_disabled"} <= codes
    audit = client.get("/api/studio/audit", headers=LOCAL).json()
    assert any(e["action"] == "recording.check" and e["outcome"] == "refused" for e in audit)


def test_recording_check_reports_every_missing_condition(app) -> None:
    body = local_client(app).post("/api/studio/recording-checks", json={}, headers=LOCAL).json()
    codes = {r["code"] for r in body["reasons"]}
    assert {"participant_missing", "consent_reference_missing", "phrase_missing", "recording_disabled"} <= codes


# Camera isolation and empty states -------------------------------------------------------------------------------

def test_studio_works_without_touching_the_camera(app) -> None:
    client = local_client(app)
    for path in ("/api/studio/status", "/api/studio/dashboard", "/api/studio/participants", "/api/studio/sessions",
                 "/api/studio/recordings", "/api/studio/reviews", "/api/studio/dataset-versions", "/api/studio/audit"):
        assert client.get(path, headers=LOCAL).status_code == 200, path


def test_empty_states_are_real_zeros(app) -> None:
    client = local_client(app)
    assert client.get("/api/studio/sessions", headers=LOCAL).json() == []
    assert client.get("/api/studio/recordings", headers=LOCAL).json() == []
    assert client.get("/api/studio/reviews", headers=LOCAL).json() == []
    assert client.get("/api/studio/dataset-versions", headers=LOCAL).json() == []
    counts = client.get("/api/studio/dashboard", headers=LOCAL).json()["counts"]
    assert counts["recordings_total"] == 0


def test_invalid_audit_limit_is_rejected(app) -> None:
    assert local_client(app).get("/api/studio/audit?limit=9999", headers=LOCAL).status_code == 422


# Protected state -------------------------------------------------------------------------------------------------

def test_active_phrase_model_is_unchanged_and_no_studio_model_exists() -> None:
    active = REPO / "ai-engine" / "models" / "phrase_classifier.joblib"
    assert hashlib.sha256(active.read_bytes()).hexdigest() == ACTIVE_MODEL_SHA
    assert not (REPO / "signbridge_training" / "model").exists()


def test_default_database_is_not_created_by_tests(app) -> None:
    assert app.state.studio_db_path.name == "api.sqlite3"
    default = REPO / "ai-engine" / "dataset" / "studio" / "studio.sqlite3"
    if default.exists():
        pytest.skip("a default Studio database already exists from a manual run; tests never write to it")
