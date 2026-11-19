"""Local SQLite store for the Dataset Collection Studio (Stage 5B).

Metadata only: participants (pseudonymous codes), consent records, sessions, recording metadata, reviews, dataset
versions and audit events. No landmarks, frames, video, names or contact details are stored here.

Protections:
- Foreign keys are enforced on every connection.
- Consent, review and audit rows are append-only (triggers block UPDATE and DELETE).
- A granted consent cannot be inserted without an authorised reviewer and the landmark and research scope.
- Writes run in BEGIN IMMEDIATE transactions, so concurrent writers wait instead of interleaving.
- The database lives under ai-engine/dataset/studio/, which is gitignored with the rest of ai-engine/dataset/.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.services.studio.errors import StudioConflict, StudioError, StudioNotFound

REPO_DIR = Path(__file__).resolve().parents[4]
DEFAULT_DB_PATH = REPO_DIR / "ai-engine" / "dataset" / "studio" / "studio.sqlite3"
SCHEMA_VERSION = 1
OPERATOR = "local-operator"

_APPEND_ONLY = (
    "CREATE TRIGGER {table}_no_update BEFORE UPDATE ON {table} BEGIN "
    "SELECT RAISE(ABORT, '{table} is append-only'); END",
    "CREATE TRIGGER {table}_no_delete BEFORE DELETE ON {table} BEGIN "
    "SELECT RAISE(ABORT, '{table} is append-only'); END",
)

MIGRATIONS: dict[int, list[str]] = {
    1: [
        """CREATE TABLE participants (
            participant_code TEXT PRIMARY KEY
                CHECK (length(participant_code) = 4 AND participant_code GLOB 'P[0-9][0-9][0-9]'),
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL
        )""",
        """CREATE TABLE consent_records (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            consent_id TEXT NOT NULL UNIQUE
                CHECK (length(consent_id) = 10 AND consent_id GLOB 'C-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]'),
            participant_code TEXT NOT NULL REFERENCES participants (participant_code),
            status TEXT NOT NULL CHECK (status IN ('pending', 'granted', 'declined', 'withdrawn')),
            form_version TEXT NOT NULL,
            scope_landmarks INTEGER NOT NULL CHECK (scope_landmarks IN (0, 1)),
            scope_video INTEGER NOT NULL CHECK (scope_video = 0),
            research_use TEXT NOT NULL CHECK (research_use IN ('internal_research_only', 'none')),
            document_ref TEXT NOT NULL,
            authorized_by TEXT CHECK (authorized_by IS NULL OR authorized_by GLOB 'REV-[0-9][0-9]'),
            supersedes_consent_id TEXT REFERENCES consent_records (consent_id),
            note TEXT NOT NULL DEFAULT '',
            recorded_at TEXT NOT NULL,
            recorded_by TEXT NOT NULL
        )""",
        """CREATE TABLE recording_sessions (
            session_id TEXT PRIMARY KEY CHECK (length(session_id) = 7 AND session_id GLOB 'SES-[0-9][0-9][0-9]'),
            participant_code TEXT NOT NULL REFERENCES participants (participant_code),
            consent_id TEXT NOT NULL REFERENCES consent_records (consent_id),
            status TEXT NOT NULL CHECK (status IN ('planned', 'closed')),
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL
        )""",
        """CREATE TABLE recordings (
            recording_id TEXT PRIMARY KEY CHECK (length(recording_id) = 8 AND recording_id GLOB 'REC-[0-9][0-9][0-9][0-9]'),
            session_id TEXT NOT NULL REFERENCES recording_sessions (session_id),
            phrase_id TEXT NOT NULL CHECK (length(phrase_id) = 6 AND phrase_id GLOB 'DYN-[0-9][0-9]'),
            status TEXT NOT NULL CHECK (status IN ('pending_review', 'accepted', 'flagged', 'rejected')),
            sha256 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE review_records (
            review_id INTEGER PRIMARY KEY AUTOINCREMENT,
            recording_id TEXT NOT NULL REFERENCES recordings (recording_id),
            reviewer_id TEXT NOT NULL CHECK (length(reviewer_id) = 6 AND reviewer_id GLOB 'REV-[0-9][0-9]'),
            decision TEXT NOT NULL CHECK (decision IN ('pending', 'accepted', 'flagged', 'rejected', 'disputed')),
            reason TEXT NOT NULL DEFAULT '',
            recorded_at TEXT NOT NULL
        )""",
        """CREATE TABLE dataset_versions (
            version_id TEXT PRIMARY KEY CHECK (length(version_id) = 7 AND version_id GLOB 'DS-[0-9][0-9][0-9][0-9]'),
            status TEXT NOT NULL CHECK (status IN ('draft', 'frozen')),
            manifest_sha256 TEXT CHECK (manifest_sha256 IS NULL OR (length(manifest_sha256) = 64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*')),
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL
        )""",
        """CREATE TABLE audit_events (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'refused', 'error')),
            detail TEXT NOT NULL DEFAULT ''
        )""",
        *(stmt.format(table="consent_records") for stmt in _APPEND_ONLY),
        *(stmt.format(table="review_records") for stmt in _APPEND_ONLY),
        *(stmt.format(table="audit_events") for stmt in _APPEND_ONLY),
        *(stmt.format(table="participants") for stmt in _APPEND_ONLY),
        """CREATE TRIGGER consent_granted_needs_authorised_reviewer BEFORE INSERT ON consent_records
            WHEN NEW.status = 'granted' AND (NEW.authorized_by IS NULL OR NEW.scope_landmarks <> 1
                OR NEW.research_use <> 'internal_research_only')
            BEGIN SELECT RAISE(ABORT, 'granted consent needs a reviewer, landmark scope and research use'); END""",
    ],
}


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class StudioStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path) if path is not None else DEFAULT_DB_PATH

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, isolation_level=None, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def connection(self, write: bool = False) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            if write:
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            if write:
                conn.execute("COMMIT")
        except BaseException:
            if write and conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def initialise(self) -> int:
        with self.connection(write=True) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
            applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
            if applied and max(applied) > SCHEMA_VERSION:
                raise StudioError("The Studio database is newer than this code. Update the code before using it.")
            for version in sorted(MIGRATIONS):
                if version in applied:
                    continue
                for statement in MIGRATIONS[version]:
                    conn.execute(statement)
                conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", (version, utc_now()))
        return self.schema_version()

    def schema_version(self) -> int:
        with self.connection() as conn:
            row = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
        return int(row[0] or 0)

    # Audit ---------------------------------------------------------------------------------------------------------

    @staticmethod
    def _audit(conn: sqlite3.Connection, action: str, entity_type: str, entity_id: str, outcome: str, detail: str = "") -> None:
        conn.execute(
            "INSERT INTO audit_events (occurred_at, actor, action, entity_type, entity_id, outcome, detail) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (utc_now(), OPERATOR, action, entity_type, entity_id, outcome, detail[:200]),
        )

    def record_event(self, action: str, entity_type: str, entity_id: str, outcome: str, detail: str = "") -> None:
        """Audit an action in its own transaction. Used for checks that do not change other rows."""
        with self.connection(write=True) as conn:
            self._audit(conn, action, entity_type, entity_id, outcome, detail)

    def list_audit(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT event_id, occurred_at, action, entity_type, entity_id, outcome, detail "
                "FROM audit_events ORDER BY event_id DESC LIMIT ?",
                (max(1, min(limit, 200)),),
            ).fetchall()
        return [dict(row) for row in rows]

    # Participants and consent -----------------------------------------------------------------------------------

    def register_participant(self, code: str) -> dict[str, Any]:
        # Refusals are audited and committed before raising. Raising inside the transaction would roll the audit back.
        refusal = None
        created = utc_now()
        with self.connection(write=True) as conn:
            if conn.execute("SELECT 1 FROM participants WHERE participant_code = ?", (code,)).fetchone():
                self._audit(conn, "participant.register", "participant", code, "refused", "already registered")
                refusal = StudioConflict("This participant code is already registered.")
            else:
                conn.execute(
                    "INSERT INTO participants (participant_code, created_at, created_by) VALUES (?, ?, ?)",
                    (code, created, OPERATOR),
                )
                self._audit(conn, "participant.register", "participant", code, "ok")
        if refusal is not None:
            raise refusal
        return {"participant_code": code, "created_at": created, "consent_status": None}

    def list_participants(self) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                """SELECT p.participant_code, p.created_at,
                    (SELECT c.status FROM consent_records c WHERE c.participant_code = p.participant_code
                     ORDER BY c.sequence DESC LIMIT 1) AS consent_status
                   FROM participants p ORDER BY p.participant_code"""
            ).fetchall()
        return [dict(row) for row in rows]

    def get_participant(self, code: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute("SELECT participant_code, created_at FROM participants WHERE participant_code = ?",
                               (code,)).fetchone()
            if row is None:
                return None
            consents = conn.execute(
                "SELECT * FROM consent_records WHERE participant_code = ? ORDER BY sequence", (code,)
            ).fetchall()
        result = dict(row)
        result["consents"] = [dict(c) for c in consents]
        result["consent_status"] = result["consents"][-1]["status"] if result["consents"] else None
        return result

    def latest_consent(self, conn: sqlite3.Connection, code: str) -> sqlite3.Row | None:
        return conn.execute(
            "SELECT * FROM consent_records WHERE participant_code = ? ORDER BY sequence DESC LIMIT 1", (code,)
        ).fetchone()

    def add_consent(self, code: str, record: dict[str, Any]) -> dict[str, Any]:
        refusal: StudioError | None = None
        recorded = utc_now()
        with self.connection(write=True) as conn:
            if conn.execute("SELECT 1 FROM participants WHERE participant_code = ?", (code,)).fetchone() is None:
                raise StudioNotFound("No participant with this code is registered.")
            latest = self.latest_consent(conn, code)
            superseded = latest["consent_id"] if latest is not None else None
            if conn.execute("SELECT 1 FROM consent_records WHERE consent_id = ?", (record["consent_id"],)).fetchone():
                self._audit(conn, "consent.record", "consent", record["consent_id"], "refused", "reference already used")
                refusal = StudioConflict("This consent reference is already used.")
            elif latest is not None and latest["status"] == "withdrawn" and record["status"] == "granted":
                self._audit(conn, "consent.record", "consent", record["consent_id"], "refused", "participant withdrawn")
                refusal = StudioConflict("This participant withdrew consent. A new consent record is needed first.")
            else:
                try:
                    conn.execute(
                        """INSERT INTO consent_records (consent_id, participant_code, status, form_version, scope_landmarks,
                           scope_video, research_use, document_ref, authorized_by, supersedes_consent_id, note, recorded_at, recorded_by)
                           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)""",
                        (record["consent_id"], code, record["status"], record["form_version"], int(record["scope_landmarks"]),
                         record["research_use"], record["document_ref"], record.get("authorized_by"), superseded,
                         record.get("note", ""), recorded, OPERATOR),
                    )
                except sqlite3.IntegrityError as error:
                    self._audit(conn, "consent.record", "consent", record["consent_id"], "refused", "database rule")
                    refusal = StudioError(f"The database rejected this consent record: {error}")
                else:
                    self._audit(conn, "consent.record", "consent", record["consent_id"], "ok", record["status"])
        if refusal is not None:
            raise refusal
        return {"consent_id": record["consent_id"], "status": record["status"], "recorded_at": recorded}

    def withdraw_consent(self, code: str, new_consent_id: str, document_ref: str, note: str) -> dict[str, Any]:
        refusal: StudioError | None = None
        recorded = utc_now()
        superseded = ""
        with self.connection(write=True) as conn:
            if conn.execute("SELECT 1 FROM participants WHERE participant_code = ?", (code,)).fetchone() is None:
                raise StudioNotFound("No participant with this code is registered.")
            latest = self.latest_consent(conn, code)
            if latest is None:
                raise StudioNotFound("This participant has no consent record to withdraw.")
            superseded = latest["consent_id"]
            if latest["status"] == "withdrawn":
                self._audit(conn, "consent.withdraw", "consent", superseded, "refused", "already withdrawn")
                refusal = StudioConflict("Consent for this participant is already withdrawn.")
            elif conn.execute("SELECT 1 FROM consent_records WHERE consent_id = ?", (new_consent_id,)).fetchone():
                self._audit(conn, "consent.withdraw", "consent", new_consent_id, "refused", "reference already used")
                refusal = StudioConflict("This consent reference is already used.")
            else:
                conn.execute(
                    """INSERT INTO consent_records (consent_id, participant_code, status, form_version, scope_landmarks,
                       scope_video, research_use, document_ref, authorized_by, supersedes_consent_id, note, recorded_at, recorded_by)
                       VALUES (?, ?, 'withdrawn', ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?)""",
                    (new_consent_id, code, latest["form_version"], latest["scope_landmarks"], latest["research_use"],
                     document_ref, superseded, note, recorded, OPERATOR),
                )
                self._audit(conn, "consent.withdraw", "consent", new_consent_id, "ok")
        if refusal is not None:
            raise refusal
        return {"consent_id": new_consent_id, "status": "withdrawn", "recorded_at": recorded,
                "supersedes_consent_id": superseded}

    def list_consents(self) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM consent_records ORDER BY sequence DESC").fetchall()
        return [dict(row) for row in rows]

    def consent_by_id(self, conn: sqlite3.Connection, consent_id: str) -> sqlite3.Row | None:
        return conn.execute("SELECT * FROM consent_records WHERE consent_id = ?", (consent_id,)).fetchone()

    # Other entities (read paths; rows are created by later sub-stages) ----------------------------------------

    def _rows(self, sql: str) -> list[dict[str, Any]]:
        with self.connection() as conn:
            return [dict(row) for row in conn.execute(sql).fetchall()]

    def list_sessions(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM recording_sessions ORDER BY session_id")

    def list_recordings(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM recordings ORDER BY recording_id")

    def list_reviews(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM review_records ORDER BY review_id DESC")

    def list_dataset_versions(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM dataset_versions ORDER BY version_id")

    def dashboard(self) -> dict[str, Any]:
        with self.connection() as conn:
            def count(sql: str) -> int:
                return int(conn.execute(sql).fetchone()[0])

            return {
                "participants_total": count("SELECT COUNT(*) FROM participants"),
                "consent_granted": count(
                    """SELECT COUNT(*) FROM participants p WHERE (SELECT c.status FROM consent_records c
                       WHERE c.participant_code = p.participant_code ORDER BY c.sequence DESC LIMIT 1) = 'granted'"""),
                "consent_withdrawn": count(
                    """SELECT COUNT(*) FROM participants p WHERE (SELECT c.status FROM consent_records c
                       WHERE c.participant_code = p.participant_code ORDER BY c.sequence DESC LIMIT 1) = 'withdrawn'"""),
                "consent_records_total": count("SELECT COUNT(*) FROM consent_records"),
                "recording_sessions_total": count("SELECT COUNT(*) FROM recording_sessions"),
                "recordings_total": count("SELECT COUNT(*) FROM recordings"),
                "recordings_pending_review": count("SELECT COUNT(*) FROM recordings WHERE status = 'pending_review'"),
                "recordings_accepted": count("SELECT COUNT(*) FROM recordings WHERE status = 'accepted'"),
                "recordings_flagged": count("SELECT COUNT(*) FROM recordings WHERE status = 'flagged'"),
                "dataset_versions_total": count("SELECT COUNT(*) FROM dataset_versions"),
            }


def assert_schema_ready(store: StudioStore) -> None:
    if store.schema_version() != SCHEMA_VERSION:
        raise StudioError("The Studio database schema is not at the expected version.")
