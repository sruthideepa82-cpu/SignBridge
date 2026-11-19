# Security and privacy notes (Stage 5B)

## Controls in place

| Control | Where | Notes |
| --- | --- | --- |
| Local-only client | `backend/app/api/studio.py::require_local_operator` | checks the client address |
| Host header check | same | defends against DNS rebinding |
| Custom header | same, and `frontend/src/services/studioService.js` | browsers from other sites cannot send it under CORS |
| Bind address | documented start command `uvicorn ... --host 127.0.0.1` | the README uses this; no change to the server |
| Server-side gate | `services/studio/gate.py` | the frontend cannot bypass it |
| Recording flag fails closed | `gate.recording_enabled` | only exact `true` enables |
| Append-only consent, review and audit | database triggers | enforced below the API |
| Granted consent needs reviewer and scope | database trigger | enforced below the API |
| Input validation | `services/studio/validation.py`, `schemas/studio.py` | pseudonyms, consent references, reviewer IDs, phrase IDs, document labels |
| No path input | `document_reference` | rejects `..`, slashes and backslashes |
| No fixed-path input | the database path is not user-supplied | |
| Refusals audited | `store.record_event`, refusal branches | written before the error is raised |
| No camera access | Studio code | verified by test with a camera that fails on use |
| No cloud calls | Studio code | the store is a local file; no network clients are used |
| Schema protection | `initialise`, version check | refuses a database newer than the code |

## Threats considered

- **Other websites calling the local API.** Blocked by the custom header (CORS), the Host check and the client-address check.
- **DNS rebinding.** Blocked by the Host check.
- **Remote machines on the same network.** Blocked by the client-address check. The backend must stay bound to 127.0.0.1.
- **Names in identifiers.** Validation rejects them at every entry point. Audit entries hold codes only.
- **Path traversal through document references.** Rejected by validation. The Studio never opens a file it was given.
- **Silent edits to consent or audit history.** Blocked by triggers.
- **Granting consent without a reviewer.** Blocked by the database trigger and the API.
- **Recording with an unverified label.** Blocked by the gate, which reads the verification file on every check.

## Known limitations (must be stated, not hidden)

1. **Single operator, not multi-user.** Any program running on this computer can call the Studio API. The header is a
   guard against web pages, not a password. Multi-user authentication was deferred by PLAN.md.
2. **No TLS.** Traffic stays on localhost. This is acceptable only while the bind address stays 127.0.0.1.
3. **File permissions are not enforced by the application.** The database file lives in the project folder. Its protection
   depends on the operating system account and disk encryption. Turn on BitLocker or equivalent for the project drive.
4. **No backups are made by the Studio.** A backup process must be decided before any real data exists.
5. **The existing developer collector bypasses the consent registry.** `backend/app/api/dataset.py` and
   `backend/app/services/dataset_store.py` accept a free-text consent reference and do not consult the Studio's consent
   records. The route is off by default (`SIGNBRIDGE_DEVELOPER_TOOLS_ENABLED`). This stage did not change it, because it is
   existing, protected work. It must be brought under the Studio gate before any real collection through that route.
6. **Shared MediaPipe and camera code paths were not modified.** The Studio does not use them yet.
7. **Recordings and sessions have no creation path yet**, so no personal data is stored beyond participants and consent
   metadata.

## Privacy position

- Stored: pseudonymous participant codes, consent metadata (status, form version, scope, reviewer ID, a label for the
  signed form), session and recording metadata (when they exist), review decisions, and audit events.
- Not stored: names, contact details, addresses, photographs, video, audio, signed form content, or landmark data.
- The signed form stays outside the repository, held offline by the project team. The Studio holds only a label for it.
- Withdrawal: a new withdrawn record blocks all future recording for that participant. Existing data handling after a
  withdrawal is part of stage 5C/5D and is not yet implemented, because no recordings exist. This is stated, not assumed.

## Logging

- Application logs are not changed by the Studio. Audit rows hold codes and identifiers only.
- Error messages returned to the operator contain no personal data.
- The API does not echo request bodies in errors.

## Before real collection (owner approval required)

- Institutional ethics approval and signed consent, per `consent_form_template.md`.
- Dataset licence arrangement for the existing images and any new recordings.
- Written owner authorisation to set `SIGNBRIDGE_STUDIO_RECORDING_ENABLED=true`.
- Decision on backups, disk encryption and retention.
- The developer collector brought under the Studio gate (limitation 5).
