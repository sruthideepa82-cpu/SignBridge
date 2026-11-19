# Recording eligibility gate (Stage 5B)

Implemented in `backend/app/services/studio/gate.py`. Enforced on the server. The frontend shows the result but cannot
change it. Stage 5B evaluates the gate and never creates a recording.

## When a recording is refused

A recording must be refused if any condition below fails. The gate returns every failing condition, not only the first.

| Code | Condition | Message shown to the operator |
| --- | --- | --- |
| `participant_missing` | no participant code given | Enter a participant code. |
| `participant_invalid` | code is not `P###` (names, short or long codes) | must be a pseudonym such as P001 |
| `participant_not_registered` | code is well formed but not registered | not registered in the Studio |
| `consent_reference_missing` | no consent reference given | A consent reference is required. |
| `consent_reference_invalid` | reference is not `C-YYYY-NNN` | format not valid |
| `consent_not_found` | no record has this reference | |
| `consent_not_for_participant` | the record belongs to someone else | |
| `consent_superseded` | the record is not the participant's latest | only the latest record can be used |
| `consent_withdrawn` | the participant's latest record is a withdrawal, or this record is one | withdrawn; no recording allowed |
| `consent_not_granted` | status is `pending` or `declined` | status is not `granted` |
| `consent_scope_missing_landmarks` | the form does not cover landmark collection | |
| `consent_scope_missing_research_use` | the form does not cover internal research use | |
| `consent_reviewer_missing` | a granted record has no authorised reviewer | |
| `phrase_missing` | no phrase chosen | Choose a phrase. |
| `phrase_unknown` | the phrase is not in the catalogue | not in the Studio catalogue |
| `phrase_unverified` | the label is not verified | blocked, with the reason |
| `recording_disabled` | the recording flag is not exactly `true` | Participant collection is disabled. |

## Phrase verification

A phrase is recordable only when `ai-engine/dataset/metadata/phrase_vocabulary.json` marks its label as:
- `verified: true`,
- with a non-empty `reviewed_by`, and
- a non-empty `reviewed_on`.

Anything else is blocked. This includes a missing file, a label not in the vocabulary, and an empty reviewer field. The
gate reads the vocabulary at each check. It never copies or edits the file, and nothing in the Studio can change a
verification status.

**Current state:** all 28 dynamic phrases are blocked (`verified: false` for all 44 entries in the vocabulary).

## Recording flag

- Name: `SIGNBRIDGE_STUDIO_RECORDING_ENABLED`.
- Read from the backend environment on every check. Not read from `.env` and not in `config.py`, which has uncommitted edits.
- Enabled only when the value is exactly `true`. Missing, empty, `True`, `TRUE`, `yes`, `1` and values with spaces are all disabled.
- Committed configuration leaves it unset (disabled).
- No development override, no hidden bypass and no frontend switch exist.
- Only the project owner can set it, through the backend environment, after the approvals listed in
  `stage5a_audit_and_plan.md` section 8.

## Result shape

```json
{
  "eligible": false,
  "reasons": [{"code": "phrase_unverified", "message": "'again' is blocked. ..."}],
  "recording_enabled": false
}
```

`eligible` is true only when `reasons` is empty. Stage 5B never acts on an eligible result. A later sub-stage will.

## Audit

Every call to `POST /api/studio/recording-checks` writes one `audit_events` row with action `recording.check`, outcome
`ok` (eligible) or `refused`, and the reason codes as detail. The row holds the phrase ID and no participant names.

## Tests

`backend/tests/test_studio_gate.py` and `backend/tests/test_studio_api.py` cover:
- the flag failing closed for every non-`true` value,
- all 28 dynamic phrases blocked by the real catalogue,
- a missing or malformed vocabulary blocking everything,
- verification requiring a reviewer and a date,
- unregistered, invalid and name-like participant codes,
- missing, malformed, unknown, foreign, pending, declined, withdrawn and superseded consent,
- missing landmark scope or research use,
- the flag off as an always-present blocker,
- and an all-conditions-met case that passes the gate only in tests, using synthetic catalogue files.
