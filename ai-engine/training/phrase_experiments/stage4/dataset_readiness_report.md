# Dataset readiness report (Stage 4)

> **Verdict: not ready for recording, training, signer-independent evaluation or live integration.** Ready only for
> continued quality control and the human-review process described in `review_protocol.md`. No ISL label is verified.

## 1. What is in the dataset

- 28 dynamic classes, 40 still frames each, 1,120 frames, from the Stage 0 manifest. `open` is included.
- The source is still images from one assumed clip per class. Frame rate and time order are unknown.
- Images are read-only and unchanged. The Stage 0 manifest, Stage 3 anomaly report and frame diagnostics all have the
  expected shape.

## 2. Quality findings (from Stage 3, carried into Stage 4)

From `dataset_quality_report.md`:

| Category | Flagged samples | Status |
| --- | ---: | --- |
| 1. Confirmed detector failure | 5 | visual check by an automated reviewer; needs independent confirmation |
| 2. Possible detector failure | 30 | rule or visual evidence; not proven |
| 3. Possible genuine signer variation | 26 | may be real signing |
| 4. Camera/framing problem | 13 | wrist at or beyond the frame edge |
| 5. Uncertain anomaly | 21 | no visual check; rule cannot decide |
| 6. Unreviewed samples | all 1,120 frames | no independent human review has been done |

- 72 frames have at least one flag. 1,048 frames have no flag. None has independent human review.
- The five priority classes (`book`, `open`, `practice`, `seat`, `team`) account for the HIGH-priority rows.
- Seven classes have no two-hand frames. One (`this`) alternates between hands.

## 3. Human-review readiness

| Requirement | Status | Note |
| --- | --- | --- |
| Review register built | completed | 95 samples, each with empty decision fields |
| Stage 3 visual checks identified | completed | 11 rows, listed in the quality report |
| Independent reviewers | blocked | none recruited; the author is excluded |
| Blinded two-reviewer process | pending | protocol written; no reviewer trained |
| Adjudication and agreement | blocked | depends on reviewers |

The 11 visual-check rows are the most important gap. Stage 3 made them as an automated assistant on still images. They
cannot count as human evidence, so they must be re-checked by reviewers who did not make them.

## 4. ISL verification readiness

| Requirement | Status | Note |
| --- | --- | --- |
| Register of 28 phrases with pending status | completed | `isl_verification_register.csv` |
| Qualified ISL expert | blocked | no expert named |
| Intended meanings | blocked | must come from the expert; none is written here |
| Sign-form check against video | blocked | depends on expert and reviewed video |
| Final approval | blocked | all labels are unapproved |

The labels are English gloss names from the dataset. They are not evidence that the performed sign has that meaning.

## 5. Consent, ethics, licence and data protection

| Requirement | Status | Note |
| --- | --- | --- |
| Signer consent process | blocked | `recording_protocol.md` section 2 is a draft; no approved form |
| Institutional ethics approval | blocked | not obtained; no reference |
| Dataset licence for existing images | blocked | no licence file; redistribution not permitted |
| Licence agreement for new recordings | blocked | not drafted |
| Data protection controls (storage, encryption, key custody) | pending | described in the protocol; not set up |
| Pseudonym mapping held separately | pending | design only |

## 6. Recording tool

- The design is written (`future_recording_tool_design.md`). It is pending approval. No code exists.
- Approval is blocked until consent and ethics are in place, because the tool would make recordings of people.

## 7. Future signer-independent evaluation

- The evaluation protocol (`evaluation_protocol.md`) needs at least three signers for any signer-independent claim,
  and five for the full rotation.
- No signer recordings exist. The evaluation is blocked.
- The current Stage 1 and Stage 2 numbers are within-clip and not independent, and must not be used for any such claim.

## 8. Live integration

- Blocked. Requires: independent human review, qualified ISL review, consent, ethics, licence, a recording-tool decision,
  data protection, signer-independent evaluation, a threshold target set by the owner, and a separate explicit approval.
- No live route, camera, MediaPipe, frontend or model loader was changed in Stage 4.

## 9. Summary of blocked requirements

Blocked (cannot start without an outside person or decision): reviewer pool, qualified ISL expert, consent approval,
ethics approval, dataset licence, signer-independent evaluation, threshold target, live integration approval.

Pending (can be done inside the project): calibration set, reviewer training once reviewers exist, data protection
setup, recording-tool approval request, and the ISL disagreement register once expert input exists.

Completed: register construction, visual-check identification, pending ISL register, quality categories, the register-level
correction, the protection of all originals and artifacts.

## 10. Limitations

- The register contains rule-based labels for most rows. Rule-based labels are not evidence.
- The visual checks were made once, by an automated assistant, on still images.
- Flags are symptoms of landmark behaviour, not proof of detector failure.
- Frame order is not known to be time order.
