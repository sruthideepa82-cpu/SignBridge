# Evaluation protocol for dynamic phrase recognition (Stage 3, Workstream D)

> **Current dataset label: WITHIN_CLIP_EXPERIMENTAL_NOT_INDEPENDENT.** Every Stage 1 and Stage 2 number is in this
> category. None of them is accuracy, generalisation or real-world performance. This protocol is for the future
> multi-signer collection only, and it cannot be run on the existing data.

## 1. Principles

1. **Recording is the unit of independence**, not frame or window. Frames from the same recording never appear on both
   sides of a split. Overlapping temporal windows from one recording are one unit.
2. **Signer is the unit of generalisation.** The test set contains signers never seen in training or validation. Where
   there are too few signers, say so and report what the design can and cannot show.
3. **The test set is touched once**, after every choice (model, features, threshold) is frozen on validation data.
4. **No random frame-level split.** This is prohibited for any split, in any stage.
5. **No threshold chosen to raise the number of predictions.** A threshold is chosen to meet a precision or false-acceptance
   target agreed in advance, on validation data.

## 2. Data partition

With **5 signers**, use a fixed rotation rather than a random split:

| Role | Signers | Use |
| --- | --- | --- |
| Train | 3 | fit models |
| Validation | 1 | choose features, model, threshold |
| Test | 1 | final single evaluation, after everything is frozen |

Repeat the rotation so that every signer is the test signer once (five outer folds). Report the spread across folds, not a
single fold. Within each fold, every recording of a signer goes to one role only.

If fewer than five signers are available, reduce the rotation accordingly and report it as a limitation. With fewer than three
signers, no signer-independent claim can be made.

Sessions and camera setups are recorded, and each fold should contain more than one session where possible, so that session
effects can be separated from signer effects in the analysis.

## 3. Negative and boundary examples

These must be in train, validation and test, with the same signer separation:

| Category | Source (see recording protocol section 6) | Treatment |
| --- | --- | --- |
| Unrelated hand movements | separate negative session | negative |
| Non-sign gestures | separate negative session | negative |
| Static poses not in the list | separate negative session | negative |
| No-hand segments | separate negative session | negative (no decision expected) |
| Incomplete gestures | cut mid-sign from target recordings | negative for the full label; report separately |
| Ambiguous gestures | annotator disputes | **excluded from scoring**, reported as a count |
| Other legitimate ISL signs | annotated by an ISL reviewer | **not automatically negative**; reported as their own group |

Other legitimate ISL signs are scored separately. Their status is decided during annotation, not assumed. Counting them as
negatives would penalise the model for correctly recognising a real sign it was not trained on, so they are reported as
a separate group with their own false-acceptance rate.

## 4. Metrics

Reported on validation (for selection) and test (once, for the report):

- **Per-class precision, recall and F1** over the 28 classes.
- **Macro-F1** (unweighted mean over classes).
- **Confusion matrix** over the 28 classes, plus a row for "rejected". Off-diagonal pairs ranked by count.
- **False acceptance rate (FAR):** share of negative windows (each negative category separately) that receive a phrase label.
- **False rejection rate (FRR):** share of true target windows that are rejected or wrongly labelled.
- **Rejection coverage:** share of all windows that receive a decision (accept or reject), reported with the threshold.
- **Ambiguity rate:** share of decisions where the top two classes are within the agreed margin.
- **Confidence calibration:** reliability diagram and expected calibration error, on validation data, before the threshold is fixed.
- **Processing latency:** time from the newest frame to a decision, measured end to end on the target machine, and reported as
  median and 95th percentile. Latency is not reported from the offline pipeline alone.
- **Per-signer and per-session results**, so that a single poor signer is visible rather than averaged away.

Report counts alongside every rate. A rate over 20 windows is not comparable with a rate over 2,000.

## 5. Threshold selection (validation only)

1. Fix the target in advance: for example, a maximum false acceptance rate on validation negatives. **The target is set by the
   project owner, not by this document.** No numeric target is proposed here.
2. On validation signers only, sweep the decision threshold and the ambiguity margin.
3. Choose the setting that meets the target and keeps the largest coverage. Record the sweep.
4. Freeze the threshold. Do not revisit it after looking at test results.
5. Apply the frozen threshold once to the test signer for each fold.

The existing phrase threshold (0.7) and the Stage 2 DTW rule (p95 of in-set distances) were not chosen this way and are not
validated.

## 6. Test-set discipline

- The test set for each fold is used once for the reported number.
- If a test result is used to change anything, the fold is reported as contaminated and the test set for that fold is retired.
- Results from one fold are never used to pick the threshold for another fold's validation.

## 7. Reproducibility

- Record the random seeds, library versions, feature configuration, data manifest hash and the signer/fold assignment for each run.
- The DTW distance matrix is computed twice and compared exactly (Stage 2 practice).
- Reports are generated by scripts, not typed by hand.

## 8. What is needed before the protocol can be run

- At least 3 signers for any signer-independent claim (5 for the full rotation).
- Recordings with measured frame rates and timestamps.
- Negative recordings in the same sessions as target recordings.
- Annotations with two annotators and a reviewer, and an ISL review of each label.
- A frozen feature contract. The current contract is protected; changing it needs its own approval.

## 9. Language for reporting

- Results are labelled with the scope: "signer-independent, N signers, N recordings" or "within-clip, not independent".
- Never write "accuracy" for a within-clip number. Use "internal consistency" or "pipeline check".
- Never describe any result as real-world recognition or as ISL translation.
