# Stage 5B implementation report: local Studio foundation

> **Scope: local database, consent and eligibility foundation, read-only Studio interface, and tests.**
> **No real participant recording. No video. No camera capture. No model training. No phrase verification change. No cloud storage. The recording flag is off and remains off.**

## 1. Files created

Backend:
- `backend/app/services/studio/__init__.py`
- `backend/app/services/studio/errors.py`: Studio error types, all subclasses of the existing `SignBridgeError`.
- `backend/app/services/studio/store.py`: SQLite schema (version 1), migrations, transactions, participant, consent, audit and read paths.
- `backend/app/services/studio/validation.py`: input rules. Participant codes reuse `ai-engine/collection/sample_record.py`.
- `backend/app/services/studio/phrases.py`: catalogue and verification lookup, read-only.
- `backend/app/services/studio/gate.py`: recording eligibility gate and recording flag.
- `backend/app/schemas/studio.py`: request and response models.
- `backend/app/api/studio.py`: local-only router under `/api/studio`.
- `backend/tests/test_studio_store.py`: 17 tests.
- `backend/tests/test_studio_gate.py`: 23 collected tests (includes parametrised cases).
- `backend/tests/test_studio_api.py`: 26 tests.

Frontend:
- `frontend/src/services/studioService.js`: API client with the required header.
- `frontend/src/services/studioService.test.js`: 6 tests.
- `frontend/src/pages/CollectionStudioPage.jsx`: routes.
- `frontend/src/components/collection-studio/StudioShell.jsx`: navigation and the status banner.
- `frontend/src/components/collection-studio/StudioDashboard.jsx`
- `frontend/src/components/collection-studio/ParticipantsPanel.jsx`
- `frontend/src/components/collection-studio/ConsentRecordsPanel.jsx`
- `frontend/src/components/collection-studio/PhraseCatalogPanel.jsx`
- `frontend/src/components/collection-studio/StudioListPanel.jsx`
- `frontend/src/components/collection-studio/StudioSettingsPanel.jsx`
- `frontend/src/components/collection-studio/useStudioData.js`
- `frontend/src/components/collection-studio/StudioComponents.test.jsx`: 10 tests.

Documentation (this folder):
- `stage5b_implementation_report.md` (this file)
- `database_schema.md`, `eligibility_gate.md`, `api_documentation.md`, `security_notes.md`

## 2. Files modified (shared, minimal)

- `backend/app/api/router.py`: one import added to the existing import line, and one `include_router` line added. The
  existing uncommitted transcription line is unchanged.
- `frontend/src/App.jsx`: one import and one route (`studio/*`) added inside the existing app shell.

Not modified: `main.py`, `config.py`, `dependencies.py` (these have pre-existing uncommitted edits, which were not touched),
the MediaPipe and camera code, the feature contracts, the phrase model, Stage 1 and Stage 2 candidates, Dynamic V2, the
preprocessing, the recognition endpoints, the sign-to-speech code, the vocabulary files, `ai-engine/collection/`, and all
existing tests.

## 3. Database schema

Seven tables plus `schema_migrations`: `participants`, `consent_records`, `recording_sessions`, `recordings`,
`review_records`, `dataset_versions`, `audit_events`. Full details are in `database_schema.md`.

## 4. API endpoints

Fifteen routes under `/api/studio`, all local-only: status, dashboard, participants (list, register, detail), consents
(list, record, withdraw), phrases, recording-checks, and read paths for sessions, recordings, reviews, dataset versions and
audit. Details are in `api_documentation.md`.

## 5. Tests executed

| Suite | Command | Result |
| --- | --- | --- |
| Studio backend tests (new) | `backend\.venv\Scripts\python.exe -m pytest tests/test_studio_store.py tests/test_studio_gate.py tests/test_studio_api.py` | 66 passed |
| Full backend suite | `backend\.venv\Scripts\python.exe -m pytest` | 281 passed, 3 skipped (baseline 215 passed, 3 skipped, plus the 66 new) |
| Studio frontend tests (new) | `npx vitest run src/services/studioService.test.js src/components/collection-studio` | 16 passed |
| Full frontend suite | `npx vitest run` | 807 passed, 1 failed (see section 7) |
| ai-engine suite | `ai-engine\..\backend\.venv\Scripts\python.exe -m pytest tests` | 199 passed, 1 skipped (unchanged) |

Tests use temporary databases and a camera stub that fails on any use. Nothing was recorded, and no participant data was
created outside the tests.

## 6. Protected-file integrity

Checked with Git and file hashes after the work:
- Protected-path diff (camera, hand detection, sequence code, phrase and landmark feature code, recognition services,
  phrase API, shared collection code, metadata, models, sign-sentence, frontend sequence components): **empty**.
- `signbridge_training/model/`: **absent**, as before.
- `ai-engine/models/phrase_classifier.joblib`: SHA-256 `ECB20D58…42AA`, **unchanged**.
- No Studio database was created inside the repository.
- The three files with pre-existing uncommitted edits (`main.py`, `config.py`, `dependencies.py`) were not edited in this
  stage. Git reports them only because of their earlier edits.
- Git status: 52 entries, up from 41 by the new Studio files and the `App.jsx` edit.
- No commits, no pushes, and no reset, stash, clean, checkout or restore were run.

## 7. Known test failure (not caused by Studio code)

`frontend/src/pages/AppPages.test.jsx`, test "Quick Phrases: adds and then edits and deletes a phrase the user wrote",
fails with a 5-second timeout in the full parallel run (two of two full runs). The same file passes 23 of 23 when run
alone. The test never opens `/studio`. My change adds one import to `App.jsx`, so I can't rule it out as a contributor
to slower module loading under load, but the failure is a timing issue in an existing test. I did not edit the test. It
should be investigated separately, for example by raising its timeout after review.

## 8. Behaviour verified end to end

Verified against a running TestClient with a temporary database:
- status reports collection disabled, with the flag off;
- participant registration and duplicate refusal, which is audited;
- all 28 dynamic phrases blocked, with reasons;
- a recording check with a valid granted consent returns refused, listing `phrase_unverified` and `recording_disabled`;
- the audit log holds the check, with its outcome.

The frontend banner reads `PARTICIPANT COLLECTION DISABLED` from the backend status, and treats an unknown status as
disabled.

## 9. Outstanding risks

1. The developer collector (`api/dataset.py`, `dataset_store.py`) writes landmark clips without consulting the Studio
   consent records. It is off by default. It must be brought under the Studio gate before any real collection through it.
2. Single-operator access only. Local programs can call the API.
3. The database file's protection depends on disk encryption and account permissions.
4. No backup process exists.
5. The `AppPages` test timeout described in section 7.
6. The Studio's audit and consent history are only as good as the local database file. Deleting the file deletes the history.
7. The phrase catalogue depends on `ai-engine/training/phrase_experiments/stage3/phrase_catalog.json`. Changing that path
   would break the catalogue and fail the gate closed, which is safe but visible.

## 10. Next recommended sub-stage

**Stage 5C (recording workflow), only after owner approval.** Its scope would be landmark capture through the existing
`GET /api/camera/landmarks` endpoint, session creation, recording metadata, and checksums. Real recording stays disabled
until the owner sets the flag. Before 5C, the developer collector (risk 1) should be decided: either brought under the gate
or disabled for research use.

## 11. Stop

Stage 5B is complete. Waiting for project-owner approval before Stage 5C. No real recordings, video, model training,
phrase verification changes, live recognition integration or cloud storage were introduced.
