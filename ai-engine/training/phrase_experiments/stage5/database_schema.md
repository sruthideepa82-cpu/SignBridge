# Studio database schema (Stage 5B, schema version 1)

Local SQLite file, Python standard library `sqlite3`. Default path: `ai-engine/dataset/studio/studio.sqlite3`. The
`ai-engine/dataset/*` folder is gitignored, so the database is never committed. Tests use temporary files and never
write to the default path.

Metadata only. The schema holds no landmarks, frames, video, audio, names, contact details or document content.

## Conventions

- Timestamps are ISO 8601 in UTC, with one-second precision.
- Participants are pseudonyms (`P001`). Consent references look like `C-2026-001`.
- Foreign keys are enforced on every connection (`PRAGMA foreign_keys = ON`).
- Writes use `BEGIN IMMEDIATE`, so concurrent writers wait instead of interleaving.
- The schema version is recorded in `schema_migrations`. A database newer than the code is refused.

## Tables

### schema_migrations
| Column | Type | Notes |
| --- | --- | --- |
| version | INTEGER PK | 1 for this stage |
| applied_at | TEXT | when the migration ran |

### participants
| Column | Type | Constraints |
| --- | --- | --- |
| participant_code | TEXT PK | exactly 4 characters, matches `P[0-9][0-9][0-9]` |
| created_at | TEXT | not null |
| created_by | TEXT | not null (single operator: `local-operator`) |

Append-only: UPDATE and DELETE are blocked by triggers.

### consent_records (append-only)
| Column | Type | Constraints |
| --- | --- | --- |
| sequence | INTEGER PK AUTOINCREMENT | order of records; "latest" means the highest sequence |
| consent_id | TEXT UNIQUE | exactly 10 characters, matches `C-[0-9]{4}-[0-9]{3}` |
| participant_code | TEXT FK | references participants |
| status | TEXT | one of `pending`, `granted`, `declined`, `withdrawn` |
| form_version | TEXT | not null |
| scope_landmarks | INTEGER | 0 or 1 |
| scope_video | INTEGER | must be 0 (video is outside this architecture) |
| research_use | TEXT | `internal_research_only` or `none` |
| document_ref | TEXT | a label for the signed form; never a path |
| authorized_by | TEXT | null, or matches `REV-[0-9]{2}` |
| supersedes_consent_id | TEXT FK | the previous record for this participant |
| note | TEXT | default empty, up to 200 characters |
| recorded_at, recorded_by | TEXT | not null |

Triggers:
- `consent_records_no_update` and `consent_records_no_delete`: any UPDATE or DELETE aborts.
- `consent_granted_needs_authorised_reviewer`: a `granted` row must have an authorised reviewer, `scope_landmarks = 1`
  and `research_use = 'internal_research_only'`. The database rejects anything else, whatever the API does.

### recording_sessions
| Column | Type | Constraints |
| --- | --- | --- |
| session_id | TEXT PK | matches `SES-[0-9]{3}` |
| participant_code | TEXT FK | |
| consent_id | TEXT FK | |
| status | TEXT | `planned` or `closed` |
| created_at, created_by | TEXT | not null |

Empty in Stage 5B. No API creates sessions yet.

### recordings
| Column | Type | Constraints |
| --- | --- | --- |
| recording_id | TEXT PK | matches `REC-[0-9]{4}` |
| session_id | TEXT FK | |
| phrase_id | TEXT | matches `DYN-[0-9]{2}` |
| status | TEXT | `pending_review`, `accepted`, `flagged` or `rejected` |
| sha256 | TEXT | null, or 64 lowercase hex characters |
| created_at | TEXT | not null |

Empty in Stage 5B. No recording can be created by this stage.

### review_records (append-only)
| Column | Type | Constraints |
| --- | --- | --- |
| review_id | INTEGER PK AUTOINCREMENT | |
| recording_id | TEXT FK | |
| reviewer_id | TEXT | matches `REV-[0-9]{2}` |
| decision | TEXT | `pending`, `accepted`, `flagged`, `rejected` or `disputed` |
| reason | TEXT | default empty |
| recorded_at | TEXT | not null |

Empty in Stage 5B. Each decision is a new row, so earlier decisions are kept.

### dataset_versions
| Column | Type | Constraints |
| --- | --- | --- |
| version_id | TEXT PK | matches `DS-[0-9]{4}` |
| status | TEXT | `draft` or `frozen` |
| manifest_sha256 | TEXT | null, or 64 lowercase hex characters |
| created_at, created_by | TEXT | not null |

Empty in Stage 5B. Exports are a later sub-stage.

### audit_events (append-only)
| Column | Type | Constraints |
| --- | --- | --- |
| event_id | INTEGER PK AUTOINCREMENT | |
| occurred_at | TEXT | not null |
| actor | TEXT | not null |
| action | TEXT | for example `participant.register`, `consent.record`, `consent.withdraw`, `recording.check` |
| entity_type | TEXT | not null |
| entity_id | TEXT | a pseudonym or an ID, never a name |
| outcome | TEXT | `ok`, `refused` or `error` |
| detail | TEXT | short reason codes, up to 200 characters |

Refused actions are written in their own transaction, so they survive the refusal.

## Integrity checks

- Duplicate participant codes are refused (primary key) and audited.
- Duplicate consent references are refused (unique) and audited.
- A participant cannot be re-granted consent after a withdrawal without a new path. The store refuses it and audits it.
- A failed write rolls back completely. Tested with a simulated failure.
- Foreign keys reject a session that names an unknown participant. Tested.

## Migration policy

Migrations are Python constants in `backend/app/services/studio/store.py`, keyed by version. Each runs inside one transaction.
A later version adds a new key and never edits an applied one.
