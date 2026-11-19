# Stage 3 summary: dynamic phrase dataset quality and recognition research

> **Experimental college research. Nothing here is verified ISL, validated recognition or production-ready.**
> No model was trained, activated or integrated. No live route, frontend component or shared service was changed.

## 1. What Stage 3 did

- Verified the repository state (`initial_state_report.md`).
- Investigated the 28 dynamic classes at frame level: presence, hand size, motion, edge position, handedness (`frame_diagnostics.py`).
- Classified every anomaly run by cause, with visual checks and rules kept separate, and kept all data (`anomaly_report.py`).
- Measured how far motion energy separates dynamic from static windows (`motion_separation.py`, with a circularity caveat).
- Designed a multi-signer recording protocol and a metadata schema, with a validator and a catalogue generated from the manifest.
- Researched recognition alternatives and evaluation design, without training anything.

## 2. Files created

Under `ai-engine/training/phrase_experiments/stage3/`:

| File | Purpose |
| --- | --- |
| `initial_state_report.md` | verified repository state before Stage 3 |
| `dataset_quality_research.md` | anomaly findings, visual checks, per-class table, recapture recommendations |
| `anomaly_report.csv` | 68 flagged runs with cause label, evidence and recommendation |
| `frame_diagnostics.py` | frame-level diagnostic script |
| `anomaly_report.py` | run grouping, cause labelling, recapture tiers |
| `motion_separation.py` | motion-energy separation measure |
| `recording_protocol.md` | multi-signer protocol (draft, not approved for collection) |
| `recording_metadata_schema.json` | draft metadata schema |
| `metadata_validator.py` | standard-library validator and catalogue builder |
| `phrase_catalog.json` | 28 phrase IDs generated from the manifest |
| `recognition_research.md` | approaches, data needs, costs, limits |
| `evaluation_protocol.md` | signer-held-out evaluation design |
| `future_recording_tool_design.md` | architecture for a future isolated tool (design only) |
| `stage3_summary.md` | this file |
| `reports/frame_diagnostics.csv` | 1,120 frame rows |
| `reports/per_class_frame_summary.csv` | per-class counts and flags |
| `reports/recapture_recommendations.csv` | tiers per class |
| `reports/motion_separation.md`, `.json` | motion separation results |

Also created: `ai-engine/tests/test_stage3_research.py` (38 tests).

No file outside these was created or changed. No recording, real or synthetic media, was created or stored.

## 3. Protected files

- Git: 39 entries now, which is the 38 at the start of Stage 3 plus the new test file. No existing change was reset,
  stashed, cleaned or overwritten.
- The protected-path diff check (sign sentence, sign-to-voice, camera and hand detection, sequence endpoint and frontend,
  phrase and landmark feature files) reported no changes.
- `signbridge_training/model/` is still absent.
- `ai-engine/models/phrase_classifier.joblib` SHA-256 is unchanged.
- The Stage 1 and Stage 2 candidate artifacts are unchanged (their recorded hashes still match).

## 4. Verified facts

- 28 dynamic classes, 40 frames each, 1,120 frames. The class list includes `open`. The list given in the brief had 27 names.
- `hungry` is UNDETERMINED in the manifest, so it is not a dynamic class and is not analysed here.
- 68 anomaly runs: 5 confirmed detector failures, 18 possible detector failures, 22 possible genuine variation, 10 camera framing, 13 uncertain.
- Seven classes have no two-hand frames. `this` alternates between hands and never shows both.
- Visual checks (by one automated reviewer, on still images):
  - `seat` frames 29–30: the same physical hand is labelled `Left` then `Right`, and a second hand is missed. Absolute steps of about 0.70–0.72 image units in frames 30–35.
  - `open` frame 35: a visible hand at normal size has a collapsed landmark geometry (wrist-to-knuckle 0.008, against 0.12 in frame 10).
  - `book` frame 9: two hands visible, one reported.
  - `team` frames 5 and 14, and `practice` frame 35: overlapping or interlocked hands, probable occlusion.
- Motion energy separates dynamic from static windows with AUC 0.94. The labels were defined from the same measure, so this is partly circular.

## 5. Experimental findings

- Recapture tiers: HIGH `book`, `open`, `practice`, `seat`, `team`. MEDIUM `break`, `congratulations`, `good morning`, `how are you`, `please`. LOW `i need help`, `this`. NONE for the other 16. These are recommendations, not decisions to delete.
- The 13 frame steps above 0.25 image units all fall in five classes: `break`, `congratulations`, `good morning`, `how are you`, `seat`.
- Presence changes are common (12–19 per clip in several classes). Whether they are genuine or detector dropout is not known without review.

## 6. Hypotheses (not tested)

- Hand-size normalisation may inflate the motion measure of windows with collapsed hands, pushing some dynamic windows upward.
- Handedness relabelling, as in `seat`, may be more common than the step-size rule finds.
- Frame order is not known to be time order, so the 0.7 step in `seat` could be a detector jump or a long gap between sampled frames. Original video timestamps are needed to tell.
- Static poses may be closer to the dynamic bank in the DTW space because the distance tracks posture. Motion-gated approaches may help, but they need negatives to test.

## 7. Tests

- Stage 3 tests (`test_stage3_research.py`): 38 passed. They cover the catalogue, the schema-to-validator agreement, required and
  invalid fields, timestamp rules, duplicates, file integrity, no media in the research folder, anomaly coverage (every flagged
  frame is in the report), no discarded data, diagnostics on synthetic hands, the AUC function, and the protected artifacts.
- Full ai-engine and backend regression: see the final report for the counts.
- Pre-existing failures: none observed.

## 8. Remaining risks

- **Labels:** none has been reviewed by a qualified ISL signer. Some dynamic classes (`open`, `team`, `book`, `practice`, `seat`) may not be the signs their labels suggest.
- **Visual checks:** made by one automated reviewer on stills. They need human re-checking.
- **Timing:** the frame rate and time order of the stills are unknown. Any speed or velocity claim is unsupported.
- **Dataset licence:** unknown. The images must not be redistributed.
- **Shortcut features:** hand presence is almost fixed per class, so presence alone can separate some classes. This was found in Stage 1 and is not solved.
- **Contract:** the feature contract is protected. A handedness-tracking fix would change it and needs its own approval.
- **Consent and ethics:** not in place. No recording may be made until they are.

## 9. Recommended next step (not started)

Wait for approval on the following, in this order:

1. **Human review** of the 11 visual-check rows and the HIGH-tier classes, by a reviewer who is not the author.
2. **ISL review** of the 28 labels, with a dispute record for each. This decides which labels stay.
3. **Consent, ethics approval and licence terms** for any collection under `recording_protocol.md`.
4. **Approval of the recording tool design** before any implementation. The design does not connect to SignBridge.
5. **Collection** only after 1–4 are complete and the project owner approves it in writing.

Until then, nothing here should be used to claim recognition performance.

## 10. Stop

Stage 3 is complete. No automatic progression to implementation, data collection, model training, live integration or activation.
