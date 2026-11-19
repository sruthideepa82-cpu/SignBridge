# Studio API (Stage 5B)

Base path: `/api/studio`. Served by the existing FastAPI app. Registered in `backend/app/api/router.py`.

## Access requirements (every route)

1. Client address must be loopback (`127.0.0.1`, `::1`). Otherwise `403 studio_forbidden`.
2. `Host` must name localhost or a loopback address. Otherwise `403 studio_forbidden`.
3. Header `X-Studio-Client: studio` must be present. Otherwise `403 studio_forbidden`.

Browsers from other sites cannot send header 3, because CORS does not allow it. The shared frontend reaches the backend
through the Vite proxy with `changeOrigin: true`, so the Host check passes.

## Error format

Same as the rest of the API (`backend/app/main.py`):

```json
{"error": {"code": "studio_conflict", "message": "This participant code is already registered."}}
```

| HTTP | Code | Meaning |
| --- | --- | --- |
| 403 | `studio_forbidden` | access rule failed |
| 404 | `studio_not_found` | participant or consent history not found |
| 409 | `studio_conflict` | duplicate participant or consent reference, or a withdrawal already exists |
| 422 | `studio_invalid` | validation failed (also the FastAPI validation error for bad input shapes) |

## Endpoints

### GET /api/studio/status
Recording flag state and local settings. No secrets, no absolute paths.

Response: `participant_collection` (`disabled`/`enabled`), `recording_enabled`, `recording_flag`, `binding`,
`schema_version`, `message`.

### GET /api/studio/dashboard
Counts from the local database. Zero when empty. Response: `counts` (object of integers), `source`.

### GET /api/studio/participants
List of participants with the latest consent status (`null` when none recorded).

### POST /api/studio/participants
Body: `{"participant_code": "P001"}`. Responds `201` with the new participant.
`422` for names or malformed codes. `409` if already registered (audited).

### GET /api/studio/participants/{code}
Participant with the full consent history (`consents` list, `consent_status`).

### GET /api/studio/consents
All consent records, newest first. Document references are labels only.

### POST /api/studio/participants/{code}/consents
Body:

```json
{
  "consent_id": "C-2026-001",
  "status": "granted",
  "form_version": "v1",
  "scope_landmarks": true,
  "document_ref": "Form v1 signed 2026-11-20",
  "authorized_by": "REV-01",
  "note": ""
}
```

Rules: `granted` needs `scope_landmarks: true` and `authorized_by` (`REV-NN`). `pending` and `declined` need
`scope_landmarks: false`. `document_ref` must not contain paths. Responds `201`.

### POST /api/studio/participants/{code}/consents/withdraw
Body: `{"consent_id": "C-2026-002", "document_ref": "Withdrawal letter 2026-12-01", "note": ""}`.
Appends a `withdrawn` record that supersedes the latest one. `409` if already withdrawn. Responds `201`.

### GET /api/studio/phrases
The 28 dynamic phrases with verification status. Each has `recording_blocked` and `blocked_reason`.

### POST /api/studio/recording-checks
Body (all optional, missing ones are reported): `{"participant_code", "consent_ref", "phrase_id"}`.
Returns `{"eligible", "reasons": [{"code", "message"}], "recording_enabled"}`. Never creates a recording and never touches
the camera. Writes an audit row. See `eligibility_gate.md`.

### GET /api/studio/sessions
### GET /api/studio/recordings
### GET /api/studio/reviews
### GET /api/studio/dataset-versions
Lists from the tables. Empty in Stage 5B, and empty lists are returned as `[]`. No create endpoints exist yet.

### GET /api/studio/audit?limit=50

Fifteen routes in total, counting each method and path above.
Recent audit events, newest first. `limit` is 1 to 200. Holds no personal data.

## Camera

No Studio route reads the camera. Live landmark status for the Studio UI, if shown later, must use the existing
`GET /api/camera/landmarks` endpoint. The Stage 5B tests replace the camera service with one that fails on any use, and
all Studio routes still pass.

## Not included in Stage 5B

Recording creation, landmark capture, review decisions, quality checks, dataset export and any write to recordings.
