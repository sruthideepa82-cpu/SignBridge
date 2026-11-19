# Initial state report (Stage 3, verified before any Stage 3 file was created)

Verified by inspecting the repository on the day of this stage. Earlier reports were not assumed to be current.

## Git

- HEAD: `0daf12d`. No commits or pushes were made in Stage 3.
- `git status` before Stage 3: 38 entries. This is the set of pre-existing uncommitted changes plus the untracked Stage 0,
  1 and 2 experiment folders and tests. Every pre-existing change was preserved.
- Protected paths with **no** diff: `signbridge_training/`, `sign-to-voice/`, `backend/app/services/camera_service.py`,
  `backend/app/services/hand_detection_service.py`, `backend/app/services/sequence_recognizer.py`,
  `backend/app/api/recognition.py`, `backend/app/services/phrase_features.py`, `backend/app/services/landmark_features.py`,
  `backend/app/services/recognition_service.py`, `frontend/src/hooks/useSequenceRecognition.js`,
  `frontend/src/components/studio/SignSentencePanel.jsx`.
- Pre-existing uncommitted edit that is **not** part of this work: `backend/app/api/dependencies.py`. It was not touched.

## Existing artifacts

| Artifact | State |
| --- | --- |
| `signbridge_training/model/` (Sign Sentence model) | **absent** (verified). Not created, not made available. |
| `ai-engine/models/phrase_classifier.joblib` (active phrase model) | SHA-256 `ECB20D58…42AA`, unchanged |
| `ai-engine/models/phrase_candidates/static_v1/` (Stage 1) | present, not activated; `candidate_full.joblib` SHA-256 matches its training report |
| `ai-engine/models/phrase_candidates/dynamic_v1/` (Stage 2) | present, not activated; `reference_bank.npz`, `dtw_config.json`, `model_card.md` |
| `ai-engine/dataset/public/isl_phrases/v2/` (Stage 0) | present: manifest, summary, per-class and duplicate reports |
| `ai-engine/training/phrase_experiments/dynamic/` (Stage 2) | present: sequence preparation, DTW evaluation, reports |

## Dataset structure

- Original images: `Dataset for everyday phrases and words in Indian sign language/images for phrases`, read-only.
  44 phrase folders, 40 images per folder, 1,760 files.
- Working copy: `ai-engine/dataset/public/isl_phrases/images/`, byte-identical to the originals (Stage 0 check).
- Stored landmarks: `ai-engine/dataset/public/isl_phrases/landmarks.npz` (IMAGE mode).
- The dataset holds still images, not videos. No original recording with a frame rate exists.
- Stage 0 manifest: 28 dynamic classes, 1,120 rows. Undetermined (5 classes) and static (11 classes) are separate.

## Existing temporal feature contract

- `signbridge_training/features.py::features` (32-frame window, 4,512 values flat, 141 per frame after the Stage 2 split).
  Imported read-only by the Stage 2 code; never copied or modified.
- `backend/app/services/camera_service.py::hand_history` keeps 64 processed frames; the sequence endpoint reads the last 32
  that ran detection. Read only.

## Existing tests

- Backend: 215 passed, 3 skipped (baseline before Stage 3).
- ai-engine: 127 passed, 1 skipped (baseline before Stage 3, Stage 2 included).

## Known limitations carried forward

- One assumed clip per phrase; no signer identities; frame rate unknown.
- Stage 1 and Stage 2 results are within-clip and not independent.
- Stage 2 DTW rejection rejected none of the out-of-set probes.
- Labels are unverified by any qualified ISL signer or interpreter.
- The dataset licence is unknown.

## Proposed Stage 3 files

Created under `ai-engine/training/phrase_experiments/stage3/` (see stage3_summary.md for the full list), plus
`ai-engine/tests/test_stage3_research.py`. No file outside this folder and the test file was created or changed.
