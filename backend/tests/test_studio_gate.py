"""Dataset Collection Studio (Stage 5B): recording eligibility gate and phrase verification gate."""

import json
from pathlib import Path

import pytest

from app.services.studio import gate, phrases, validation
from app.services.studio.errors import StudioError
from app.services.studio.store import StudioStore

REPO = Path(__file__).resolve().parents[2]
DYNAMIC_LABELS = [
    "again", "agree", "answer", "attendance", "book", "break", "congratulations", "email", "file", "good morning",
    "home", "how are you", "i need help", "join", "meet", "open", "pass", "please", "practice", "pressure", "seat",
    "sun", "team", "thirsty", "this", "together", "wait", "where",
]


def granted(consent_id: str = "C-2026-001") -> dict:
    return {"consent_id": consent_id, "status": "granted", "form_version": "v1", "scope_landmarks": 1,
            "research_use": "internal_research_only", "document_ref": "Form v1 signed", "authorized_by": "REV-01",
            "note": ""}


@pytest.fixture
def store(tmp_path: Path) -> StudioStore:
    s = StudioStore(tmp_path / "gate.sqlite3")
    s.initialise()
    return s


@pytest.fixture
def verified_catalog(tmp_path: Path) -> list[dict]:
    """A synthetic catalogue and vocabulary, used only to prove the gate can pass. Not the project's files."""
    catalog = tmp_path / "catalog.json"
    vocab = tmp_path / "vocab.json"
    catalog.write_text(json.dumps({"phrases": [{"phrase_id": "DYN-01", "phrase_label": "test sign"}]}), encoding="utf-8")
    vocab.write_text(json.dumps({"phrases": [{"label": "test sign", "verified": True, "reviewed_by": "REV-01",
                                              "reviewed_on": "2026-11-20"}]}), encoding="utf-8")
    return phrases.load_catalog(catalog, vocab)


def codes(result: dict) -> set[str]:
    return {r["code"] for r in result["reasons"]}


def test_recording_flag_fails_closed() -> None:
    assert gate.recording_enabled({}) is False
    assert gate.recording_enabled({gate.RECORDING_FLAG: ""}) is False
    assert gate.recording_enabled({gate.RECORDING_FLAG: "false"}) is False
    assert gate.recording_enabled({gate.RECORDING_FLAG: "True"}) is False
    assert gate.recording_enabled({gate.RECORDING_FLAG: " true"}) is False
    assert gate.recording_enabled({gate.RECORDING_FLAG: "yes"}) is False
    assert gate.recording_enabled({gate.RECORDING_FLAG: "true"}) is True


def test_flag_is_off_in_this_environment_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(gate.RECORDING_FLAG, raising=False)
    assert gate.recording_enabled() is False


def test_every_dynamic_phrase_is_blocked_by_the_real_catalogue() -> None:
    catalog = phrases.load_catalog()
    assert sorted(p["label"] for p in catalog) == sorted(DYNAMIC_LABELS)
    assert all(p["recording_blocked"] for p in catalog)
    assert all(p["verified"] is False for p in catalog)
    assert all("Unverified" in p["blocked_reason"] for p in catalog)


def test_missing_vocabulary_blocks_everything(tmp_path: Path) -> None:
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps({"phrases": [{"phrase_id": "DYN-01", "phrase_label": "again"}]}), encoding="utf-8")
    items = phrases.load_catalog(catalog, tmp_path / "missing.json")
    assert items[0]["recording_blocked"] is True


def test_verification_needs_a_reviewer_and_a_date(tmp_path: Path) -> None:
    catalog = tmp_path / "catalog.json"
    vocab = tmp_path / "vocab.json"
    catalog.write_text(json.dumps({"phrases": [{"phrase_id": "DYN-01", "phrase_label": "again"}]}), encoding="utf-8")
    vocab.write_text(json.dumps({"phrases": [{"label": "again", "verified": True, "reviewed_by": "", "reviewed_on": ""}]}),
                     encoding="utf-8")
    assert phrases.load_catalog(catalog, vocab)[0]["recording_blocked"] is True


def test_unregistered_participant_is_refused(store: StudioStore, verified_catalog: list[dict]) -> None:
    result = gate.evaluate(store, participant="P001", consent_ref="C-2026-001", phrase_id="DYN-01",
                           enabled=True, catalog=verified_catalog)
    assert "participant_not_registered" in codes(result)
    assert result["eligible"] is False


@pytest.mark.parametrize("value", ["Asha", "P1", "p001", "P0001", "../P001", "P00A"])
def test_names_and_malformed_codes_are_refused(store: StudioStore, verified_catalog: list[dict], value: str) -> None:
    result = gate.evaluate(store, participant=value, consent_ref="C-2026-001", phrase_id="DYN-01",
                           enabled=True, catalog=verified_catalog)
    assert "participant_invalid" in codes(result)


def test_missing_participant_and_consent_are_refused(store: StudioStore) -> None:
    result = gate.evaluate(store, participant=None, consent_ref=None, phrase_id=None, enabled=False)
    assert {"participant_missing", "consent_reference_missing", "phrase_missing", "recording_disabled"} <= codes(result)


def test_malformed_consent_reference_is_refused(store: StudioStore) -> None:
    store.register_participant("P001")
    result = gate.evaluate(store, participant="P001", consent_ref="consent one", phrase_id="DYN-01", enabled=False)
    assert "consent_reference_invalid" in codes(result)


def test_consent_must_exist_and_belong_to_the_participant(store: StudioStore) -> None:
    store.register_participant("P001")
    store.register_participant("P002")
    store.add_consent("P002", granted("C-2026-002"))
    missing = gate.evaluate(store, participant="P001", consent_ref="C-2026-404", phrase_id="DYN-01", enabled=False)
    assert "consent_not_found" in codes(missing)
    other = gate.evaluate(store, participant="P001", consent_ref="C-2026-002", phrase_id="DYN-01", enabled=False)
    assert "consent_not_for_participant" in codes(other)


def test_pending_or_declined_consent_is_refused(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", {"consent_id": "C-2026-001", "status": "pending", "form_version": "v1",
                               "scope_landmarks": 0, "research_use": "none", "document_ref": "Form pending",
                               "authorized_by": None, "note": ""})
    result = gate.evaluate(store, participant="P001", consent_ref="C-2026-001", phrase_id="DYN-01", enabled=False)
    assert "consent_not_granted" in codes(result)


def test_withdrawn_consent_blocks_even_the_earlier_grant(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted("C-2026-001"))
    store.withdraw_consent("P001", "C-2026-002", "Withdrawal letter", "")
    result = gate.evaluate(store, participant="P001", consent_ref="C-2026-001", phrase_id="DYN-01", enabled=False)
    assert {"consent_superseded", "consent_withdrawn"} <= codes(result)


def test_only_the_latest_granted_record_is_usable(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted("C-2026-001"))
    store.add_consent("P001", granted("C-2026-002"))
    old = gate.evaluate(store, participant="P001", consent_ref="C-2026-001", phrase_id="DYN-01", enabled=False)
    assert "consent_superseded" in codes(old)
    current = gate.evaluate(store, participant="P001", consent_ref="C-2026-002", phrase_id="DYN-01", enabled=False)
    assert "consent_superseded" not in codes(current)


def test_unverified_phrase_is_blocked_with_a_reason(store: StudioStore) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted())
    result = gate.evaluate(store, participant="P001", consent_ref="C-2026-001", phrase_id="DYN-01", enabled=True)
    assert "phrase_unverified" in codes(result)
    assert result["eligible"] is False


def test_unknown_phrase_is_refused(store: StudioStore) -> None:
    result = gate.evaluate(store, participant=None, consent_ref=None, phrase_id="DYN-99", enabled=True)
    assert "phrase_unknown" in codes(result)


def test_flag_disabled_is_always_a_blocker(store: StudioStore, verified_catalog: list[dict]) -> None:
    store.register_participant("P001")
    store.add_consent("P001", granted())
    result = gate.evaluate(store, participant="P001", consent_ref="C-2026-001", phrase_id="DYN-01",
                           enabled=False, catalog=verified_catalog)
    assert codes(result) == {"recording_disabled"}
    assert result["eligible"] is False


def test_all_conditions_met_is_eligible_in_the_gate_only(store: StudioStore, verified_catalog: list[dict]) -> None:
    """The gate can pass when every condition holds. Stage 5B never creates a recording from this result."""
    store.register_participant("P001")
    store.add_consent("P001", granted())
    result = gate.evaluate(store, participant="P001", consent_ref="C-2026-001", phrase_id="DYN-01",
                           enabled=True, catalog=verified_catalog)
    assert result["eligible"] is True and result["reasons"] == []


def test_validators_reject_paths_names_and_bad_reviewers() -> None:
    with pytest.raises(StudioError):
        validation.document_reference("../../secrets/form.pdf")
    with pytest.raises(StudioError):
        validation.document_reference("C:\\forms\\form.pdf")
    with pytest.raises(StudioError):
        validation.participant_code("Asha")
    with pytest.raises(StudioError):
        validation.reviewer_id("Dr Smith")
    with pytest.raises(StudioError):
        validation.consent_id("consent-one")
    with pytest.raises(StudioError):
        validation.phrase_id("DYN-1")
    assert validation.participant_code("P007") == "P007"
    assert validation.consent_id("C-2026-007") == "C-2026-007"
    assert validation.reviewer_id("REV-03") == "REV-03"
    assert validation.document_reference("Form v1 signed 2026-11-20") == "Form v1 signed 2026-11-20"
