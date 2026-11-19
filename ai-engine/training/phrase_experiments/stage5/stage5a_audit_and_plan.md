# Stage 5A: repository audit and implementation plan (Dataset Collection Studio)

> **Status: audit and plan only. No application code was changed. No real participant recording is enabled.**
> This stage stops for owner decisions (section 8). Stages 5B to 5E wait for those decisions.

## 1. Repository state (verified)

- HEAD `0daf12d`. Git entries: 41 at the start of this stage (the 40 from Dynamic V2 plus the new V2 test file). None
  of those changes were touched. Pre-existing uncommitted work includes transcription and speech files, and edits to
  `backend/app/api/router.py`, `backend/app/core/config.py`, `backend/app/main.py`, `backend/app/api/dependencies.py`,
  `frontend/src/pages/LiveStudioPage.jsx` and `frontend/vite.config.js`.
- Protected paths with no diff: MediaPipe and hand detection, the camera service, the phrase and landmark feature code,
  the phrase recognizer, the sequence recognizer and endpoint, the sign-sentence model folder (absent), sign-to-voice,
  and the active phrase model (hash `ECB20D58…42AA`).

## 2. What exists (verified by reading the files)

### 2.1 Backend (FastAPI)

- Layout: `backend/app/api/` (routers per domain), `schemas/` (Pydantic), `services/` (logic), `core/` (settings,
  exceptions). Routers are registered in `backend/app/api/router.py`, which is a **protected file**.
- Conventions to follow: `APIRouter(prefix=...)`, Pydantic response models, `SignBridgeError` for domain errors, and a
  common error payload `{"error": {"code", "message"}}` from `backend/app/main.py`.
- Settings: `backend/app/core/config.py` (`pydantic-settings`, env prefix `SIGNBRIDGE_`). Its `.env` file is outside git.
- Camera: `CameraService` owns the single webcam. Its landmark endpoint `GET /api/camera/landmarks` returns the newest
  processed hands and a `frame_sequence` number. This is read-only and is the natural source of landmark samples.
- **No database, no authentication, no object storage, no upload handling exists in the backend.** The only matches for
  `upload`, `storage` and `auth` are the transcription service's error code and an unrelated MediaPipe URL.
- Tests: `backend/tests/` (215 passing, 3 skipped) and `ai-engine/tests/` (199 passing, 1 skipped, including Dynamic V2).

### 2.2 Frontend (React, Vite, Tailwind)

- Pages in `frontend/src/pages/`, routes in `frontend/src/App.jsx`, shared UI in `components/app/ui.jsx` (`Panel`,
  `buttonClass`, `StatusDot`), icons from `lucide-react`. Tests use Vitest and Testing Library.
- Existing feature folders: `components/studio/` already belongs to **Live Studio** (the translator page). The Dataset
  Studio must use a different folder name to avoid collisions (for example `components/collection-studio/`).
- Dependencies: `@supabase/supabase-js` is present, but only for an optional learning-progress feature (section 2.4).
- No dashboard or table component library exists. Tables and dialogs would be built from Tailwind classes.

### 2.3 Existing dataset collection tooling (the most important reuse)

`ai-engine/collection/` already implements a **landmark-only, consent-gated, local** recording workflow:

- `collect_static.py`: records landmark samples for a **verified** label. It refuses an unverified label, a malformed
  participant ID (`P###`), a missing consent reference, and an existing output file. It never writes video.
- `sample_record.py`: the validators that the Studio must reuse (`load_vocabulary`, `verified_classes`,
  `validate_participant`, `validate_consent_ref`, `accept_hands`, `build_sample`).
- `dataset_stats.py`: reproducible participant-level splits (`assign_splits`) and coverage and leakage reports.
- `ai-engine/dataset/README.md`: the protocol. It says only landmarks are recorded, with no video, images or audio, and
  that participant IDs are pseudonyms. Raw data lives in `ai-engine/dataset/raw/`, which is gitignored.
- `ai-engine/dataset/metadata/vocabulary.json`: 36 classes, **0 verified**. Its `consent.status` is `not_recorded`.
- `ai-engine/dataset/metadata/phrase_vocabulary.json`: 44 phrases, all `verified: false`, status `candidate_unverified`.

A second, parallel recording system would duplicate this. The brief forbids duplicating existing systems, so the Studio
should extend these gates rather than replace them.

### 2.4 Supabase (optional, already in the repo)

- `supabase/migrations/` has three migrations: `profiles`, `learn_progress` and `sign_translations`. Each table uses
  Row Level Security and `auth.uid()` policies.
- `frontend/src/lib/supabaseClient.js` creates a client only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
  Without them, everything stays in the browser.
- These tables are for learners, not dataset collection. Using Supabase for participant data would be a cloud service
  holding personal data, which the project rules and consent wording currently rule out (section 3).

### 2.5 Planned but not built

- `docs/DEVELOPMENT_PLAN.md` Phase 5 and `PLAN.md`: MongoDB behind a repository layer, and JWT authentication with hashed
  passwords. Neither exists.

## 3. Conflicts with the brief (must be resolved by the owner)

| # | Brief requires | Project rule or fact | Consequence |
| --- | --- | --- | --- |
| C1 | Capture **original video** with a browser recording mechanism (section 8) | `consent_form_template.md`: "We will **not** record or store video, photos, audio". `ai-engine/dataset/README.md`: "No video, images, or audio". PLAN.md section 9: "Do not record or persist raw video by default" | Video capture is outside the approved consent wording. It needs new wording, ethics approval and a storage policy. **Not implemented in this plan.** |
| C2 | A database (Section 4), authentication (Section 13), server-side storage | PLAN.md section 3.3: "Do not add a database, authentication, cloud infrastructure … before the core workflow requires it" | Needs an explicit owner decision. A local store (stdlib SQLite) avoids cloud infrastructure. |
| C3 | Storage with restricted video access and signed URLs (Section 13) | Consent template: "Recordings are kept on the project computer, not uploaded to a server" | Storage must be local. Any hosted storage contradicts the consent wording. |
| C4 | Phrase recording for the 28 dynamic classes | All 44 phrases are `verified: false`. The gate in `collect_static.py` refuses unverified labels. PLAN.md Phase 3 says the vocabulary must be checked against the official ISLRTC reference before collection | Recording any of the 28 classes is **blocked by the project's own gate** until a qualified reviewer verifies each label. The Studio must enforce the same gate. |
| C5 | Dynamic signs in the Studio | `dataset/README.md` section 1: "Dynamic signs need a separate protocol (Phase 7)" | A dynamic recording protocol does not exist yet. The Stage 3 protocol is a draft, not an approved protocol. |
| C6 | Browser webcam recording with getUserMedia | `CameraService` holds the single webcam while the backend camera runs (`camera_service.py`) | The browser and the backend cannot both hold the camera. Landmark capture should read the existing `GET /api/camera/landmarks` stream instead, which needs no change to the camera. |
| C7 | Register new routes and a new studio module | `backend/app/api/router.py` is protected; `frontend/src/App.jsx` routes are shared | Adding a router or a route touches shared files. Owner approval is needed. |
| C8 | Server-side authentication and authorised users (Section 13) | No auth exists; PLAN.md defers it | Without auth, the Studio must run on `127.0.0.1` only, for one operator, with the access limits documented. Multi-user access needs a decision. |

## 4. Recommended scope (for approval)

**Recommendation: a local, landmark-only Dataset Collection Studio that extends the existing collection tooling.**

- **Recording unit:** landmark sequences read from the existing `GET /api/camera/landmarks` endpoint while the backend
  camera runs. No video, no images, no browser camera capture. This matches the consent wording.
- **Sequence capture:** a start and stop control in the Studio. Each processed frame becomes one row (frame sequence,
  time, hands and 21 points each). Sequence windows are not stored as video.
- **Storage:** a local SQLite file (Python standard library, no new dependency) under `ai-engine/dataset/studio/`, which
  is gitignored, plus JSON Lines files in `ai-engine/dataset/raw/`, matching the existing raw format.
- **Access:** bound to `127.0.0.1`. One operator token from the environment, plus reviewer identities recorded in the
  database. This is not multi-user authentication and must be described as such.
- **Consent gate (server-side):** recording starts only when (a) the signer has a consent record with status `granted`,
  (b) the consent reference is well formed, (c) the owner has set `SIGNBRIDGE_STUDIO_RECORDING_ENABLED=true`, and (d) the
  label is verified in `vocabulary.json`. The default is disabled. The owner's approval is needed before (c) is set.
- **Quality:** reuse `sample_record.py` validators. Add checks for duplicate sample hashes, short sequences, missing
  hands and frame gaps. Flags are kept separate from automatic decisions and never delete data.
- **Export:** versioned, read-only snapshots with SHA-256 per file. Excludes withdrawn consent. No personal data. Not fed
  into training automatically.

## 5. Proposed architecture

```
frontend/src/components/collection-studio/   (new; separate from components/studio = Live Studio)
  dashboard, signers, consent, recording, recordings, review, quality, datasets, settings
frontend/src/services/studioService.js       (new; calls /api/studio/* only)

backend/app/api/studio.py                     (new router; registered in router.py, protected, needs approval)
backend/app/schemas/studio.py                 (new)
backend/app/services/studio/                  (new package)
  store.py          SQLite access (stdlib sqlite3), migrations as Python constants
  consent.py        eligibility gate and withdrawal handling
  recording.py      landmark capture from CameraService.landmark_snapshot() and hand_history()
  quality.py        integrity checks, flags only
  export.py         versioned manifests and SHA-256
  audit.py          append-only audit events (no personal data)
ai-engine/collection/studio_bridge.py         (new) reuses sample_record.py and dataset_stats.py
ai-engine/dataset/studio/                     (gitignored) SQLite database and export folders
```

Read-only dependencies on protected code: `CameraService.landmark_snapshot`, `hand_history`, `GET /api/camera/landmarks`,
and `sample_record.py` validators. No protected module is edited by the Studio itself.

## 6. Data model (summary; full dictionary in Stage 5B)

Entities from the brief, mapped to local tables: `signers` (pseudonym `P###`, status, registration date), `consent_records`
(append-only: status, scope, reference, date, reviewer), `phrases` (copied from `vocabulary.json` with verification
status), `recording_sessions` (session ID, camera settings, operator), `recordings` (recording ID, signer, label, start and
end times, frame count, sequence file path, SHA-256, status), `annotations` (append-only), `quality_reports` (flags),
`dataset_versions` (export manifests), and `audit_events` (append-only, no personal data).

Rules: rows are never updated in place for consent, annotation or quality history. Corrections are new rows.

## 7. Staged delivery (after approval)

- **5B: Foundation.** Local store, migrations, signer registration, consent records, eligibility gate with the recording switch
  off, dashboard with real counts (zero is shown as zero), and tests for the gate. Requires approval of C2, C6, C7.
- **5C: Recording workflow.** Landmark capture from the existing endpoint, start and stop, duration, observed frame
  rate, checksums. Tested with synthetic landmark streams, never with a participant. Real recording stays disabled.
- **5D: Review and quality.** Review states, reviewer notes, dispute handling without overwriting, quality flags. Tests for
  the review workflow and history.
- **5E: Export and integration tests.** Versioned manifests, withdrawal handling, authorization tests, and the protected-subsystem
  isolation test (hashes of protected files before and after).

No stage starts until the previous stage is reviewed. Each stage reports files, commands, test results and protected-file hashes.

## 8. Decisions needed from the project owner before Stage 5B

1. **Scope (C1):** landmark-only (recommended, matches the consent wording), or original video (requires new consent wording,
   ethics approval and a storage policy first)?
2. **Storage (C2, C3):** local SQLite and local files (recommended), or a hosted service (Supabase or MongoDB, which
   contradicts the consent wording and PLAN.md section 3.3)?
3. **Access (C8):** single-operator local use only (recommended for now), or multi-user authentication (deferred by PLAN.md)?
4. **Labels (C4, C5):** confirm that the Studio will refuse all 28 dynamic phrases until each is verified by a qualified
   reviewer. Confirm also that no separate dynamic protocol will be used until one is approved.
5. **Shared files (C7):** approve the registration of a `studio` router in `backend/app/api/router.py` and the new
   `/studio` route in `frontend/src/App.jsx`. Both are shared files with uncommitted changes that must be preserved.
6. **Camera (C6):** approve landmark capture through the existing endpoint, with the backend camera running. No browser camera.
7. **Consent and ethics:** confirm that the consent form is still a draft, and that real recording stays disabled until
   institutional ethics approval and signed consent exist (PLAN.md Phase 3).
8. **Recording switch:** confirm who may set `SIGNBRIDGE_STUDIO_RECORDING_ENABLED`, and that it stays `false` in every
   committed configuration.

## 9. Initial risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Video captured outside consent | Ethics and legal breach | Video is out of scope until C1 is resolved; no video code path |
| Recording unverified labels | Invalid dataset | Server-side verified-label gate, matching `collect_static.py` |
| Consent recorded but not valid | Recording without consent | Eligibility gate requires status, reference and owner switch |
| Personal data in logs or exports | Privacy breach | Audit events hold no personal data; exports exclude withdrawn signers |
| Shared-file conflicts | Lost uncommitted work | Edits only after approval, with hashes checked before and after |
| Local-only access mistaken for secure multi-user access | False security claim | Document as single-operator, bound to 127.0.0.1 |
| Camera conflict between browser and backend | Failed capture | Landmark capture only through the existing backend camera |
| Deletion of a withdrawn signer's data | Loss of audit history | Withdrawal marks data excluded and removes raw files per the protocol; audit keeps a withdrawal event without personal data |

## 10. What this stage did not do

- No code was written, and no existing file was modified.
- No database was created and no dependency was installed.
- No model was trained and no dataset file was changed.
- No recording, camera access or consent record was created.
- No label was marked verified.

**Stop.** Waiting for the owner's decisions in section 8 before Stage 5B.
