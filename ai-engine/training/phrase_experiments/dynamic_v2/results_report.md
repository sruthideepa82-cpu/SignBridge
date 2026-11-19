# Dynamic 28-phrase experiment (v2): results report

> **WITHIN_CLIP_EXPERIMENTAL_NOT_INDEPENDENT.** Not real-world recognition accuracy. Not signer-independent. Not
> activated. Not connected to SignBridge's live recognition.

## 1. What the data is

- 28 dynamic phrases, each one assumed clip of 40 still frames. The original frame rate is unknown.
- 252 windows: 9 per clip, 32 frames each, stride 1. Adjacent windows share 31 frames.
- One clip per phrase means no signer identity and no independent test set. Any split inside a phrase shares its clip.

## 2. Method

- **Features:** the Stage 2 temporal features (imported read-only from `signbridge_training/features.py`), split per
  frame into 141 values. Each window is summarised by the mean, standard deviation, minimum and maximum of each per-frame
  value over its 32 frames (564 values), plus left and right presence fractions, both-hands fraction, presence transitions
  and the summed wrist path (5 values). Total 569.
- **Candidate:** logistic regression with standard scaling, C = 1.0. Chosen before any results.
- **Comparison:** random forest, 300 trees.
- **Validation:** the windows starting at frames 0 and 8 are held out. The rest are used for fitting. Each held-out window
  shares up to 31 frames with its nearest fitted window, so this hold-out is **leaky by design**. It is only a
  consistency check.
- **Control:** clip labels are reassigned at random (10 seeds), refitted, and scored against the true labels.
- **Threshold:** none chosen.

## 3. Results

| Model | Fit check (resubstitution) | Held-out accuracy (leaky) | Held-out macro-F1 (leaky) |
| --- | ---: | ---: | ---: |
| Logistic regression (candidate) | 1.000 | 1.000 | 1.000 |
| Random forest (comparison) | 1.000 | 1.000 | 1.000 |
| Logistic regression, clip labels permuted (control) | — | 0.036 ± 0.017 | — (chance 0.036) |

**Reading the results.**
- Perfect held-out scores are expected here and say nothing about handshape. A held-out window sits 1 to 31 frames from
  a training window of the same clip, so the model only has to recognise its own clip.
- The permutation control shows this directly. When the clip labels are shuffled, the same procedure scores at chance
  against the true labels. The high score therefore depends on matching clip identity.
- The candidate produced no held-out failure cases (`failure_cases.csv` has a header only). This is a property of the
  leaky split, not evidence of recognition.
- The per-class precision, recall and F1 are all 1.000, and the confusion matrix is diagonal. Both are meaningless for
  the same reason.

## 4. What is not measured

- Generalisation to new signers, cameras, lighting or clips.
- Rejection of unrelated movements, static poses or unlisted signs. No negatives are included.
- Calibration. The top-probability values were recorded, but no threshold was chosen or justified.
- Latency on the live pipeline.

## 5. Comparison with earlier stages

- **Stage 2 DTW (reference only, not rerun):** in-set acceptance 67%, undetermined probes 56% accepted, static probes
  91% accepted, rejection 0% for both out-of-set groups. The DTW rule did not separate unrelated movement.
- The aggregated model here is not compared as a rejection system, because it has no rejection rule.

## 6. Why no GRU, LSTM or temporal CNN

- 28 assumed clips, 252 overlapping windows. A recurrent or convolutional model would fit each clip and could not be
  tested on any independent clip.
- TensorFlow, PyTorch and tslearn are not installed. None was added.
- Reconsider only with several signers, several independent clips per phrase, and a signer-held-out split.

## 7. Failure cases and limitations

- No held-out failures, because the split is leaky. Failure analysis needs independent data.
- Presence is almost fixed per class (Stage 1 finding), so presence features may separate some classes without any
  handshape information.
- Frame order is not known to be time order.
- Labels are unreviewed by any qualified ISL signer or interpreter.
- The candidate is not loadable by the live recognizer (the feature count differs, and the loader checks for 131 values).

## 8. Files

Experiment folder (`ai-engine/training/phrase_experiments/dynamic_v2/`):
- `train_dynamic_v2.py`: the training and evaluation script
- `results_report.md`: this report
- `reproducibility.md`: commands, seeds and software versions

Artifacts (`ai-engine/models/phrase_candidates/dynamic_v2/`):
- `candidate_logistic_regression.joblib`, `comparison_random_forest.joblib`
- `experiment_config.json`, `training_report.json`, `evaluation_report.md`, `model_card.md`
- `class_map.json`, `failure_cases.csv`, two confusion-matrix CSVs

## 9. Status

Experiment complete. No integration. Waiting for explicit approval before any next step.
