# SignBridge ISL dataset protocol

**Status (2026-11-08): protocol and tooling in place. No class is verified yet, and no samples have been recorded.**

This folder documents how labelled Indian Sign Language (ISL) landmark samples are defined, recorded, and split. It does not contain data. Data is kept out of git.

## 1. What is recorded

- Only MediaPipe hand landmarks: 21 points per hand with normalized `x`, `y`, and `z`, plus the detector's handedness and score.
- No video, images, or audio. The collection tool never writes frames.
- Static signs first (one posture per sample). Dynamic signs need a separate protocol (Phase 7).

## 2. Vocabulary rules

Vocabulary is defined in `metadata/vocabulary.json`. A class is usable only when all of these hold:

1. The label and meaning are checked against an official ISL reference (see the `sources` list in that file). Use the signed video, not a written description.
2. The class has `hands` set to `1` or `2`, matching the handshape.
3. `verified` is `true`, and `reference` names the source and the page, video, or entry used.
4. A named reviewer is recorded in the `reviewed_by` field, with a date.

Do not map English letters or ASL signs to ISL labels. ISL fingerspelling is a separate system and must be checked against the ISLRTC reference. Fingerspelling is described as two-handed in the common form, so one-hand-only capture may not cover it.

## 3. Consent and participants

- Each signer gives informed consent before any recording. The signed form is kept outside this repository.
- Participants are identified only by pseudonyms (`P001`, `P002`, ...). Names and contact details never go into files or commits.
- Record the consent form reference (`--consent-ref`, for example `C-2026-001`). Keep the mapping from pseudonym to person offline and separate.
- A participant can ask for their data to be removed. Deleting their `raw/` files and their rows in the split table is the removal procedure.

## 4. Recording procedure

Run from `backend/` after installing the backend requirements:

```powershell
python ..\ai-engine\collection\collect_static.py --label "<verified label>" `
    --participant P001 --consent-ref C-2026-001 --samples 50
```

The tool refuses to run when:

- the label is not a verified class,
- the participant ID is not `P###`,
- the consent reference is missing or malformed,
- the output file already exists (it is never overwritten).

Each accepted sample has exactly the number of hands the class needs, every hand has 21 landmarks, and every hand's score is at least `--min-score` (default 0.8). Frames that do not meet this are skipped.

Recording guidance, to get variety:

- Vary hand size, skin tone, lighting, background, camera angle, and the position of the hand in the frame.
- Record with both hands where the class allows it, and with the signer's usual dominant hand.
- Record across several sessions and days for each signer.
- Avoid recording the same posture for all samples without small pose changes.

## 5. Storage layout

```text
ai-engine/dataset/
  README.md                       (this file, committed)
  metadata/vocabulary.json        (committed; class definitions and sources)
  metadata/                       (other metadata: class counts, split table; not committed)
  raw/                            (recorded samples and session manifests; not committed)
  processed/                      (features built for training; not committed)
```

Raw files are one JSON object per line. Each line has `label`, `participant`, `session`, `sample_index`, `captured_at`, and `hands` (handedness, score, and 21 `[x, y, z]` points per hand). Each session also writes a `.session.json` manifest with the consent reference, camera settings, and start time.

## 6. Splitting and counts

- Split by participant, not by sample. All samples from one participant go to one split.
- `collection/dataset_stats.assign_splits` gives a reproducible participant-level split for a given seed (70/15/15 by default). Save the result as `metadata/split_table.csv` (`participant,split`). This file is not committed.
- Training, validation, and test splits are fixed before any tuning. Tuning uses validation only. The test split is used once for the final report.
- Run the report after each recording session:

```powershell
python ..\ai-engine\collection\dataset_stats.py --raw ..\ai-engine\dataset\raw `
    --split-table ..\ai-engine\dataset\metadata\split_table.csv --min-participants 2
```

  It prints counts per class and flags participants without a split and classes with fewer than the minimum number of participants in any split.
- Classes with few participants must be flagged as limited in the results.

## 6a. Templates

- `templates/reviewer_worksheet.md`: one per candidate class. A class is verified only when a reviewer completes it.
- `templates/consent_form_template.md`: draft wording. Needs ethics approval before use.
- `templates/participant_register_template.csv`: header only. The real register is kept offline or in `metadata/` (not committed).

## 6b. Current state and what a trained model needs

- Verified classes (poster-checked, signer confirmation pending): C, L, O, S, U, V. See `metadata/vocabulary.json`.
- Training needs at least 2 participants in each of train, val, and test for every class. That means at least 6 participants in total. Fewer participants cannot give a participant-level test score, so the training script refuses to run.
- Pilot order: record consent, assign pseudonyms, record sessions for every class, build `split_table.csv`, run `dataset_stats.py`, then train.

Commands (from `backend/`):

```powershell
python ..\ai-engine\collection\collect_static.py --label C --participant P001 --consent-ref C-2026-001 --samples 50
python ..\ai-engine\collection\dataset_stats.py --raw ..\ai-engine\dataset\raw --split-table ..\ai-engine\dataset\metadata\split_table.csv
python ..\ai-engine\training\train_static_classifier.py --raw ..\ai-engine\dataset\raw --split-table ..\ai-engine\dataset\metadata\split_table.csv
```

## 6c. Pilot: train on your own hand (single signer)

Use this to see the whole pipeline work on one person. It does not show how well the model works for other people.

1. **Consent.** If you are the only signer, record your own consent on paper or in a note outside the repository, and use a reference such as `SELF-2026-001`. Keep it out of git.
2. **Record three sessions per letter.** Each run of the tool is one session. Between sessions, change the lighting, distance, or background.
3. **Train with the pilot mode.** The most recent session of each letter becomes the test set, and the earlier sessions train the model.
4. **Restart the backend.** It loads the model file once at startup.

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-ai.txt

# Repeat for each letter: C, L, O, S, U, V. Run this three times per letter, on different days if possible.
python ..\ai-engine\collection\collect_static.py --label C --participant P001 --consent-ref SELF-2026-001 --samples 40

python ..\ai-engine\training\train_static_classifier.py --raw ..\ai-engine\dataset\raw --pilot-single-signer

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The training script refuses to run unless each letter has at least 20 training samples and 10 test samples, from separate sessions. The report says "single_signer_session_split" and carries a warning, so it cannot be mistaken for a participant-level result.

Expect these before a model is useful:
- A letter appears on the translator only when its confidence reaches the threshold (`SIGNBRIDGE_RECOGNITION_THRESHOLD`, default 0.7). Otherwise the panel shows "Not recognized" with the confidence, so you can see how close it is.
- U and V may be confused. Check the confusion matrix in `ai-engine/models/static_classifier_report.json`.
- Your own signing style is the only style the model learns.

## 7. Known limitations of this dataset (to be updated)

- Nothing is recorded yet, so there are no counts.
- Handedness is what the detector reports. Its left/right correctness is not yet validated on the live camera (see `PLAN.md`, Section 6).
- Recordings come from the webcam and detector in use, which may not represent other devices or lighting.
- The detector tracks hands between frames (VIDEO mode). A hand that enters the frame can take a few frames to be detected, so the first moment of a posture may be dropped. Two-hand classes need the second hand to be steady before the sample is taken. The tool skips frames that do not match, so this lowers the number of accepted samples rather than corrupting them.
- ISL vocabulary must be checked by a qualified reviewer. Automated checks cannot confirm sign meaning.

## 8. Browser Dataset Collector (developer only)

The Dataset Collector page is a developer tool. It is shown only when the frontend is built or run with
VITE_SIGNBRIDGE_DEVELOPER_TOOLS=true, and the backend routes return 404 unless SIGNBRIDGE_DEVELOPER_TOOLS_ENABLED=true.
Keep both off in any deployed build.

- It uses the camera and landmark pipeline Live Studio already uses. Frames are taken from processed frames only, so
  the same frame is never stored twice.
- Each recording is a clip of frames, not a single pose. A clip must last at least 1.5 seconds and have at least 10
  frames. Hands must be in view for at least 30% of frames, the same rule as the offline extractor.
- Clips are saved to ai-engine/dataset/clips/<LABEL>/<clip_id>.json (gitignored). Export them as CSV (one row per
  frame) or JSON from the page or from GET /api/dataset/export?format=csv|json.
- The same gates apply on the page and on the server: the letter must be verified in vocabulary.json (UNKNOWN is
  always allowed), the participant must be a P### pseudonym, and a consent reference is required.
- Until a qualified signer verifies a letter and consent is recorded, recording stays locked for that letter.