"""Dataset Collection Studio (Stage 5B): local SQLite foundation. Uses temporary databases only."""

import sqlite3
from pathlib import Path

import pytest

from app.services.studio.errors import StudioConflict, StudioError, StudioNotFound
from app.services.studio.store import MIGRATIONS, SCHEMA_VERSION, StudioStore


def granted(consent_id: str = "C-2026-001", reviewer: str = "REV-01") -> dict:
    return {"consent_id": consent_id, "status": "granted", "form_version": "v1", "scope_landmarks": 1,
            "research_use": "internal_research_only", "document_ref": "Form v1 signed", "authorized_by": reviewer,
            "note": ""}


@pytest.fixture
def store(tmp_path: Path) -> StudioStore:
    s = StudioStore(tmp_path / "studio.sqlite3")
    s.initialise()
    return s


def test_initialisation_creates_the_schema_once(store: StudioStore) -> None:
    assert store.schema_version() == SCHEMA_VERSION == 1
    assert store.initialise() == 1
    with store.connection() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"participants", "consent_records", "recording_sessions", "recordings", "review_records",
            "dataset_versions", "audit_events", "schema_migrations"} <= tables


def test_database_newer_than_code_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "future.sqlite3"
    s = StudioStore(path)
    s.initialise()
    with s.connection(write=True) as conn:
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (99, 'x')")
    with pytest.raises(StudioError, match="newer"):
        s.initialise()


def test_foreign_keys_are_enforced(store: StudioStore) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        with store.connection(write=True) as conn:
            conn.execute(
                "INSERT INTO recording_sessions (session_id, participant_code, consent_id, status, created_at, created_by) "
                "VALUES ('SES-001', 'P999', 'C-2026-999', 'planned', 'x', 'x')"
            )


def test_participant_codes_must_match_the_pseudonym_pattern(store: StudioStore) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        with store.connection(write=True) as conn:
            conn.execute("INSERT INTO participants (participant_code, created_at, created_by) VALUES ('Asha', 'x', 'x')")


def test_duplicate_participant_is_refused_and_audited(store: StudioStore) -> None:
    store.register_participant("P001")
    with pytest.raises(StudioConflict):
        store.register_participant("P001")
    actions = [(e["action"], e["outcome"]) for e in store.list_audit()]
    assert ("participant.register", "refused") in actions
    assert ("participant.register", "ok") in actions


def test_granted_consent_needs_an_authorised_reviewer_at_database_level(store: StudioStore) -> None:
    store.register_participant("P001")
    bad = granted()
    bad["authorized_by"] = None
    with pytest.raises(StudioError):
        store.add_consent("P001", bad)


def test_granted_consent_needs_landmark_scope_at_database_level(store: StudioStore) -> None:
    store.register_participant("P001")
    bad = granted()
    bad["scope_landmarks"] = 0
    with pytest.raises(StudioError):
        store.add_consent("P001", bad)


def test_consent_rows_cannot_be_updated_or_deleted(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted())
    with pytest.raises(sqlite3.IntegrityError):
        with store.connection(write=True) as conn:
            conn.execute("UPDATE consent_records SET status = 'declined' WHERE consent_id = 'C-2026-001'")
    with pytest.raises(sqlite3.IntegrityError):
        with store.connection(write=True) as conn:
            conn.execute("DELETE FROM consent_records WHERE consent_id = 'C-2026-001'")


def test_audit_rows_cannot_be_changed(store: StudioStore) -> None:
    store.register_participant("P001")
    with pytest.raises(sqlite3.IntegrityError):
        with store.connection(write=True) as conn:
            conn.execute("UPDATE audit_events SET outcome = 'ok'")
    with pytest.raises(sqlite3.IntegrityError):
        with store.connection(write=True) as conn:
            conn.execute("DELETE FROM audit_events")


def test_withdrawal_appends_a_record_that_supersedes_the_grant(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted())
    result = store.withdraw_consent("P001", "C-2026-002", "Withdrawal letter 2026-12-01", "participant request")
    assert result["supersedes_consent_id"] == "C-2026-001"
    participant = store.get_participant("P001")
    assert participant["consent_status"] == "withdrawn"
    assert [c["status"] for c in participant["consents"]] == ["granted", "withdrawn"]


def test_withdrawing_twice_is_refused(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted())
    store.withdraw_consent("P001", "C-2026-002", "Withdrawal letter", "")
    with pytest.raises(StudioConflict):
        store.withdraw_consent("P001", "C-2026-003", "Withdrawal letter", "")


def test_withdrawn_participant_cannot_be_re_granted_without_a_new_record_path(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted())
    store.withdraw_consent("P001", "C-2026-002", "Withdrawal letter", "")
    with pytest.raises(StudioConflict):
        store.add_consent("P001", granted("C-2026-003"))


def test_duplicate_consent_reference_is_refused(store: StudioStore) -> None:
    store.register_participant("P001")
    store.register_participant("P002")
    store.add_consent("P001", granted("C-2026-010"))
    with pytest.raises(StudioConflict):
        store.add_consent("P002", granted("C-2026-010"))


def test_consent_for_unknown_participant_is_not_found(store: StudioStore) -> None:
    with pytest.raises(StudioNotFound):
        store.add_consent("P050", granted())


def test_failed_write_rolls_back_completely(store: StudioStore) -> None:
    store.register_participant("P001")
    with pytest.raises(RuntimeError):
        with store.connection(write=True) as conn:
            conn.execute("INSERT INTO participants (participant_code, created_at, created_by) VALUES ('P002', 'x', 'x')")
            raise RuntimeError("simulated failure")
    assert store.get_participant("P002") is None


def test_dashboard_counts_come_from_the_database_and_start_at_zero(store: StudioStore) -> None:
    counts = store.dashboard()
    assert counts["participants_total"] == 0
    assert counts["recordings_total"] == 0 and counts["recording_sessions_total"] == 0
    store.register_participant("P001")
    store.add_consent("P001", granted())
    counts = store.dashboard()
    assert counts["participants_total"] == 1 and counts["consent_granted"] == 1


def test_migration_list_is_versioned_and_contiguous() -> None:
    assert sorted(MIGRATIONS) == list(range(1, SCHEMA_VERSION + 1))
