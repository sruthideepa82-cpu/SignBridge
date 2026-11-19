# Human review protocol (Stage 4)

> **Preparation only.** No review has been done. No decision is recorded. This protocol defines how a review
> would be run. It does not verify any ISL label and does not change any sample.

## 1. Scope

- **Dynamic frames:** 1,120 (28 classes x 40 frames). These are the stills from the Stage 0 manifest.
- **Flagged samples:** 95, each one a frame, a reported hand and a flag. They are listed in `human_review_register.csv`.
- **Visual-check rows:** 11. Stage 3 made these checks as an automated assistant on still images. They are not
  independent human review and must be confirmed or overturned by human reviewers.
- **Other frames:** unflagged frames are not reviewed by this protocol. They are listed as "unreviewed" in the quality report.
- **ISL labels:** handled by the separate verification register and by a qualified ISL expert. Not by this review.

## 2. Reviewer requirements

- **Independence:** reviewers must not be the author of the Stage 3 or Stage 4 code, and must not have produced any
  Stage 3 visual check. Record any conflict of interest.
- **Minimum:** two reviewers per flagged sample, plus a third for disagreements. The pair is chosen so that neither
  reviewer sees the other's decision first.
- **Skill:** reviewers are trained on the decision rules below with a calibration set of at least ten samples
  (outside the register) before they review the register. Record the training date.
- **Identity:** reviewers are recorded only by pseudonymous ID (`REV-NN`). The key between ID and person is held
  separately under access control.
- **Blinding:** reviewers see the frame, the hand and the flag location. They do **not** see Stage 3's cause label
  or the Stage 3 evidence text until after they record a decision. This prevents anchoring on the automated label.

## 3. Materials

- The original still image, opened read-only. Reviewers must never edit, crop or save over the original.
- The frame location (`frame_number`, `source_file`, reported hand and flag).
- A zoomed view of the hand region, if the reviewer's tool allows it. Any zoom is a copy, not the original.
- A neighbouring-frames view (frame n-1 and n+1), so that motion can be judged. Note that the frames are not known to be consecutive in time.

## 4. Decision vocabulary

Each reviewer chooses exactly one decision per sample:

| Decision | Use when |
| --- | --- |
| `CONFIRMED_DETECTOR_FAILURE` | the reported landmark for this hand contradicts the visible hand (for example, a visible hand is missing, the hand size is impossible for the visible hand, or a second hand is missed) |
| `POSSIBLE_DETECTOR_FAILURE` | the image is consistent with a detector error, but the reviewer cannot be sure (for example, heavy occlusion) |
| `GENUINE_VARIATION` | the reported landmarks match the visible hand, and the unusual motion or pose is plausibly part of the signing |
| `CAMERA_FRAMING` | the hand is cut off by the frame edge, or the signing space is outside the frame |
| `CANNOT_DECIDE` | the image does not show enough to decide |
| `NEEDS_ISL_REVIEW` | the decision depends on whether the pose is the intended form of the sign |

Write one or two sentences of notes whenever the decision is not `GENUINE_VARIATION`. Notes must describe what is
visible (for example, "right hand fully visible, palm up, fingers spread; landmark size reported as 0.008").

## 5. Procedure

1. Reviewer 1 records a decision and notes for each sample in `reviewer_1_decision` and `reviewer_1_notes`.
2. Reviewer 2 does the same independently in `reviewer_2_decision` and `reviewer_2_notes`.
3. Where the two agree, `reconciled_decision` is set to that decision and `review_status` becomes `reviewed_agreed`.
4. Where they disagree, a third reviewer decides. `reconciled_decision` records the third decision and
   `review_status` becomes `reviewed_adjudicated`.
5. Where any reviewer chooses `NEEDS_ISL_REVIEW`, the sample is passed to the ISL register, and `review_status` becomes
   `pending_isl_review`.
6. Record the inter-rater agreement (Cohen's kappa on the decision categories) for each batch. A low agreement stops the
   batch: the calibration set is repeated before continuing.

No sample is deleted or modified by any step.

## 6. Priority order

Review in this order, so that the most consequential samples are handled first:

1. The five visual-check classes' samples: `seat`, `open`, `book`, `team`, `practice`.
2. The 11 visual-check rows, regardless of class.
3. Remaining HIGH-priority rows.
4. MEDIUM rows.
5. LOW rows.

## 7. What a review cannot establish

- Whether a label matches the sign it names. That is the ISL verification process.
- Whether a movement is correct ISL form.
- Whether any result generalises to new signers or cameras.
- Whether a detector is reliable in general.

## 8. After review

- Results go into the register's decision and reconciliation fields, with the reviewer IDs.
- Confirmed and possible detector failures are carried into the next recording round's recapture list. They are not
  removed from the dataset.
- Any change to the dataset (for example, a new manifest) must be made by a new script, with a new dataset version.
  Stage 4 does not make any such change.

## 9. Record keeping

- Every decision has a date, reviewer ID, and notes.
- The register is kept under version control only after the reviewer identities are checked for privacy.
- The quality report is regenerated from the register, never edited by hand.
