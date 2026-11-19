# Stage 4 summary: dataset validation and human-review preparation

> **Preparation only.** No human review was done. No ISL label was verified. No sample was removed or modified.
> No recording, training, model change or live integration was done.

## 1. What was inspected

- The Stage 3 documents: `stage3_summary.md`, `dataset_quality_research.md`, `recognition_research.md`,
  `recording_protocol.md`, `evaluation_protocol.md`, `future_recording_tool_design.md`, `initial_state_report.md`.
- The Stage 3 outputs: `anomaly_report.csv` (68 runs), `reports/frame_diagnostics.csv` (1,120 frames),
  `phrase_catalog.json` (28 IDs).
- The Stage 0 manifest, read-only: 1,760 rows, 1,120 dynamic.
- The repository: Git state, protected-path diff, protected artifacts, and the original image folder.

## 2. What was created

All under `ai-engine/training/phrase_experiments/stage4/`:

| File | Purpose |
| --- | --- |
| `build_review_artifacts.py` | generates the three registers and the quality report from Stage 3 outputs |
| `human_review_register.csv` | 95 flagged samples, one row per frame, hand and flag, with empty review fields |
| `isl_verification_register.csv` | 28 phrases, all `pending`, no meanings written |
| `dataset_quality_report.md` | categories 1–6 with counts, the 11 visual-check rows, and register-level corrections |
| `review_protocol.md` | blinded two-reviewer process, decision vocabulary, adjudication, priority order |
| `stage4_checklist.md` | 32 requirements, each marked completed, pending or blocked |
| `dataset_readiness_report.md` | readiness by area, with blocked items named |
| `stage4_summary.md` | this file |

Test file created: `ai-engine/tests/test_stage4_review.py` (17 tests).

## 3. Existing files modified

**None.** No Stage 0, 1, 2 or 3 file, no existing test, no sample and no protected file was changed.

## 4. Key counts

- Dynamic frames: 1,120. Frames with at least one flag: 72. Flagged samples in the register: 95.
- Categories: confirmed detector failure 5; possible detector failure 30; possible genuine variation 26;
  camera/framing 13; uncertain 21.
- Visual-check rows: 11 (see section 5).
- Samples with independent human review: 0.
- ISL labels verified: 0. Pending: 28.

## 5. The 11 visual-check rows

These are the Stage 3 visual checks. They were made by an automated assistant on still images, so they are not independent
human evidence. Each needs confirmation or overturning by reviewers who did not make them.

| Review ID | Class | Frame | Hand | Flag | Stage 3 cause |
| --- | --- | ---: | --- | --- | --- |
| HR-0001 | book | 9 | left | size_low | confirmed (visual check) |
| HR-0049 | open | 35 | right | jump | confirmed (visual check) |
| HR-0050 | open | 35 | right | size_low | confirmed (visual check) |
| HR-0063 | practice | 35 | left | jump | possible (occlusion) |
| HR-0064 | practice | 35 | left | size_low | possible (occlusion) |
| HR-0067 | seat | 30 | right | abs_jump | confirmed (visual check) |
| HR-0068 | seat | 30 | right | jump | confirmed (visual check) |
| HR-0076 | team | 5 | left | jump | possible (occlusion) |
| HR-0077 | team | 5 | left | size_low | possible (occlusion) |
| HR-0081 | team | 14 | left | jump | possible (occlusion) |
| HR-0082 | team | 14 | left | size_low | possible (occlusion) |

Two points about these rows:
- `seat` frame 29 was part of the Stage 3 check but has no flag, so it has no row. Its review is still needed.
- `open` frame 10 is a reference frame with no flag, and is not in the register.

## 6. A correction made in Stage 4

Stage 3 labelled whole anomaly runs CONFIRMED when only one frame in each run had been visually checked. In the Stage 4
register, CONFIRMED is given only to the visually checked frames. Other frames of those runs are classed POSSIBLE. The
Stage 3 file is unchanged, and the correction is written in `dataset_quality_report.md`.

## 7. Tests

- Stage 4 tests (`test_stage4_review.py`): 17 passed. They check that the register matches every flagged sample in the
  diagnostics, that IDs are unique, that decision fields are empty, that the 11 visual-check rows match Stage 3 exactly,
  that CONFIRMED is only on checked samples, that no sample is marked for deletion, that the ISL register has 28 pending
  rows with no meanings, that the quality report counts match the register, that the checklist uses only the three status
  words, that the rebuild is deterministic, and that the protected artifacts are unchanged.
- Full regression suites: see section 8.

## 8. Repository integrity

- Git HEAD: `0daf12d`. Git entries: 39 at the start of Stage 4 and 40 at the end (one new test file, listed below).
- Protected-path diff (signbridge_training, sign-to-voice, camera and hand detection, sequence endpoint and frontend,
  phrase and landmark feature files, phrase recognizer and API): empty.
- `signbridge_training/model/`: still absent.
- `ai-engine/models/phrase_classifier.joblib`: SHA-256 `ECB20D58…42AA`, unchanged.
- Stage 1 candidate `candidate_full.joblib`: hash matches its training report.
- Stage 2 `dtw_config.json`: status `not_activated`.

**Pre-existing uncommitted changes (not created by Stage 4, preserved, not touched):**
- Modified: `backend/app/api/dependencies.py`, `backend/app/api/router.py`, `backend/app/core/config.py`,
  `backend/app/core/exceptions.py`, `backend/app/main.py`, `frontend/src/components/conversation/MessageComposer.jsx`,
  `frontend/src/components/studio/ConversationPanel.jsx`, `frontend/src/hooks/useSpeechOutput.js`,
  `frontend/src/pages/LiveStudioPage.jsx`, `frontend/vite.config.js`.
- Untracked (transcription and speech work): `backend/app/api/transcription.py`, `backend/app/schemas/transcription.py`,
  `backend/app/services/transcription_service.py`, `backend/scripts/check_transcribe_live.py`,
  `backend/tests/test_transcription_api.py`, `backend/tests/test_transcription_service.py`, `frontend/public/audio/`,
  and several `frontend/src/...` transcription and caption files.
- Four of the modified files are on the protected list: `config.py`, `main.py`, `dependencies.py` and `router.py`. Their
  uncommitted edits predate Stage 4 and were left as they were.

**Stage 4 untracked additions:** `ai-engine/training/phrase_experiments/stage4/` and `ai-engine/tests/test_stage4_review.py`.

## 9. Outstanding human-review requirements

1. Recruit at least two independent reviewers per flagged sample, plus a third for adjudication. None are recruited.
2. Declare conflicts of interest. The author and the Stage 3 assistant are excluded.
3. Build a calibration set of at least ten samples outside the register, and train reviewers on the decision rules.
4. Run blinded two-reviewer decisions over the 95 samples, starting with the five priority classes and the 11 visual-check rows.
5. Record inter-rater agreement for each batch.
6. Confirm or overturn the 11 visual-check rows.

## 10. Outstanding ISL requirements

1. Identify a qualified ISL expert. None is named.
2. Obtain intended meanings from the expert. None is written here.
3. Check each of the 28 labels against reviewed video.
4. Record disagreements and disputes with references.
5. Give final approval, or record why a label is not approved.

## 11. Readiness for Stage 5

**Not ready.** Live integration is blocked by the items in `stage4_checklist.md` marked blocked, including independent
review, ISL review, consent, ethics, licence and signer-independent evaluation. A separate, explicit approval is required
for Stage 5. Stage 4 does not authorise it.

## 12. Stop

Stage 4 preparation is complete. No recording, training, model development, label change, deletion or live integration
was done. Waiting for explicit approval before any of these.
