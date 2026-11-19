# Recognition research: dynamic phrases after the DTW baseline (Stage 3, Workstream C)

> **Experimental research only. No approach here is validated.** Every statement about performance relies on the existing
> dataset, which has one assumed clip per phrase and unknown frame rate. Nothing here is accuracy or generalisation.

## 0. What the DTW result actually showed (Stage 2, within-clip)

| Measure | Result | What it means |
| --- | --- | --- |
| In-set acceptance (other-clip reference) | 67% accepted, 29% ambiguous, 5% rejected | distance rule keeps most windows; not a success rate |
| Undetermined probes rejected | 0% (56% accepted) | rejection does not separate unrelated movement |
| Static probes rejected | 0% (91% accepted) | static poses sit closer to the dynamic bank than dynamic clips do to each other |

Median nearest different-clip distance: dynamic 2.51, static probes 1.92. So distance to the bank tracks posture more
than temporal structure. A nearest-neighbour match is therefore not evidence of a recognised sign.

Motion energy (Stage 3, `motion_separation.md`) separates dynamic from static windows with **AUC 0.94**. This is
partly circular: the labels came from the same wrist-travel measure. Static windows never exceed the dynamic median.

## 1. Approaches

Each entry gives the problem it addresses, the data it needs, its advantages and limitations, its cost, whether it can work
with the current data, and whether new recordings are required.

### 1.1 DTW with alternative alignment and normalisation

- **Problem:** the baseline's distance is dominated by posture, and the normalisation by 64 is a fixed constant.
- **Variants:** a Sakoe-Chiba band (limits warping), derivative DTW (compares velocity instead of position), z-normalised
  trajectories, and normalising by the warping path length rather than T + S.
- **Data:** the existing windows are enough to run it, but any variant is still tuned on the one-clip-per-phrase set.
- **Advantages:** no training, interpretable, easy to reproduce.
- **Limitations:** no rejection mechanism of its own; the Stage 2 result suggests the distance itself is the problem.
- **Cost:** O(T^2) per pair. Fine for 252 windows; a 1,000-window bank needs chunking.
- **Works with current data:** runs, but cannot be validated.
- **New recordings needed:** yes, for any claim.

### 1.2 Shape features

- **Problem:** hand shape carries most of the handshape information, and the per-frame shape block is already in the feature vector.
- **Data:** current frames are enough to compute the features.
- **Advantages:** position-invariant; already implemented in `features.py`.
- **Limitations:** shape alone does not capture motion, and the static-versus-dynamic result suggests shape dominates the current distance.
- **Cost:** low.
- **Works with current data:** yes, as a feature, not as evidence.
- **New recordings needed:** yes, for validation.

### 1.3 Wrist trajectory

- **Problem:** a dynamic sign is mainly a movement path.
- **Data:** wrist positions over time; present in the current stills, but with unknown timing.
- **Advantages:** directly encodes motion; cheap.
- **Limitations:** depends on frame timing, which the stills do not provide. Collapsed hand sizes in `open`, `team`, `book`, `practice`
  distort trajectories if they are normalised by hand size.
- **Cost:** low.
- **Works with current data:** partly; timing is the blocker.
- **New recordings needed:** yes. Original video with timestamps is required.

### 1.4 Velocity and motion direction

- **Problem:** speed and direction separate similar paths traced at different speeds.
- **Data:** the same as 1.3; velocity depends on the frame timing.
- **Advantages:** speed invariance can be designed in by normalising time.
- **Limitations:** the frame rate is unknown, so absolute velocity is meaningless for the stills. Relative direction is still usable.
- **Cost:** low.
- **Works with current data:** direction only, and with caveats.
- **New recordings needed:** yes, for absolute speed.

### 1.5 Relative hand movement

- **Problem:** two-hand signs depend on how the hands move relative to each other.
- **Data:** both hands present. Seven classes have no two-hand frames at all, and `this` alternates.
- **Advantages:** encodes two-hand structure directly (the `rel` block already does this).
- **Limitations:** undefined when a hand is absent. The `seat` handedness relabel makes the relative feature unreliable.
- **Cost:** low.
- **Works with current data:** only for the 21 classes with at least one two-hand frame, and several of those have very few (`together` 2 frames, `book` 6). Not for the seven one-hand or alternating classes.
- **New recordings needed:** yes, to fix handedness association first.

### 1.6 Missing-hand representation

- **Problem:** absent hands are zero blocks, and the current contract mixes "absent" with "zero motion".
- **Data:** presence per frame is available.
- **Options:**
  - keep zeros, plus explicit presence channels per frame;
  - track each physical hand by position across frames instead of by handedness label (fixes the `seat` relabel);
  - recognise one-hand and two-hand phrases with separate branches.
- **Advantages:** removes a major shortcut (presence is almost fixed per class).
- **Limitations:** changes the feature contract, which is protected. Any change needs its own approval.
- **Cost:** low to moderate.
- **Works with current data:** a presence-only check is possible; a fixed contract needs new recordings to validate.
- **New recordings needed:** yes.

### 1.7 Temporal consistency

- **Problem:** a single window can be wrong; a sign should persist across consecutive windows.
- **Options:** require the same label for k consecutive decisions (hysteresis), or require agreement across overlapping windows.
- **Advantages:** reduces spurious single-window decisions. The frontend stabilizer already does something similar for static phrases.
- **Limitations:** overlapping windows are not independent, so consistency across them is not evidence of recognition.
- **Cost:** low.
- **Works with current data:** only as a logic check, not as validation.
- **New recordings needed:** yes, to measure its effect honestly.

### 1.8 Static-versus-dynamic discrimination

- **Problem:** the DTW baseline accepted most static probes.
- **Options:** a motion gate (reject windows whose motion energy is below a threshold set on validation signers), a separate static detector, or a two-stage design.
- **Data:** negatives with static poses are required, and they must be recorded (see the protocol section 6).
- **Advantages:** addresses the observed failure mode directly.
- **Limitations:** the current separation is circular. The motion gate threshold must come from data not used for the labels.
- **Cost:** low.
- **Works with current data:** a diagnostic only.
- **New recordings needed:** yes.

### 1.9 Unknown-class rejection (open-set)

- **Problem:** the system must say "none of these" when a signer makes an unrelated movement or an unlisted sign.
- **Options:**
  - distance threshold on a reference bank (the Stage 2 approach, which failed on these probes);
  - margin between the best and second-best class;
  - an explicit background class trained on negative recordings;
  - an energy score from a discriminative model, fitted on validation data.
- **Advantages:** the explicit background class is the most direct; margin and distance are cheap.
- **Limitations:** every option needs negative recordings to be tested. Without them, rejection cannot be validated. Negatives that are real ISL signs need annotation before they count as negatives.
- **Cost:** low for thresholds; moderate for a background class.
- **Works with current data:** no, because no independent negatives exist beyond the static and undetermined stills.
- **New recordings needed:** yes, essential.

### 1.10 Confidence calibration

- **Problem:** a score of 0.7 means nothing unless calibrated. The existing 0.7 phrase threshold was not calibrated for this model.
- **Options:** Platt scaling or isotonic regression fitted on validation signers; reliability diagrams; expected calibration error.
- **Data:** validation signers, separate from test signers.
- **Advantages:** makes the threshold interpretable.
- **Limitations:** calibration on one clip per class is meaningless.
- **Cost:** low.
- **Works with current data:** no.
- **New recordings needed:** yes.

## 2. Model options

### 2.1 Neural temporal models (GRU, LSTM, temporal CNN)

- **Recommendation:** do not train one now. Not justified by the current data:
  - 28 assumed clips, one per phrase; overlapping windows are not independent;
  - no signer identities, so no independent evaluation;
  - TensorFlow, PyTorch and tslearn are not installed, and the brief says not to add them automatically.
- **Reconsider when:** there are several signers, several independent clips per phrase, a validation split by signer, and a
  rejection set. Even then, compare against a simple baseline first, and report the number of independent recordings.

### 2.2 Classical fixed-length baseline

- A logistic regression on a fixed-length summary (resampled wrist and shape trajectories, hand presence, motion energy).
- Cheap, interpretable, and easy to compare with DTW.
- Not runnable meaningfully until the multi-signer data exists.

## 3. Recommended path (for approval, not implementation)

1. Keep DTW as the reference baseline, with the band and derivative variants added.
2. Fix the handedness association (track physical hands by position) before any relative-hand feature is trusted.
3. Record negatives and boundary cases (protocol section 6) before any rejection work.
4. Only after 3, compare a motion gate, a margin rule and a background class, all with thresholds chosen on validation signers.
5. Calibrate confidence on validation signers, then freeze and evaluate once on test signers.
6. Consider a neural model only if the multi-signer data and evaluation design justify it.

## 4. Things this research does not establish

- No recognition accuracy, for any approach.
- No conclusion that any approach generalises to new signers, cameras or lighting.
- No claim that any nearest-neighbour match is a recognised sign.
- No threshold chosen to raise prediction counts.
