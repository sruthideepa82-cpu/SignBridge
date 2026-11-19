# Dynamic phrase dataset quality research (Stage 3, Workstream A)

> **Status: experimental research. Nothing here is verified ISL.** Labels come from the Stage 0 manifest and remain
> unreviewed by any qualified ISL signer or interpreter. All "visual checks" were made by one automated reviewer reading
> still images, not by a qualified annotator. Every visual label needs human re-checking before anyone relies on it.

## 1. Scope and class list (verified)

- The authoritative list is the Stage 0 manifest: **28 dynamic classes**, 40 frames each, 1,120 rows.
- The list you gave me had 27 names. The manifest's 28th class is **`open`**. It is kept here, as you asked.
- **`hungry`** is *not* dynamic. The manifest marks it UNDETERMINED (no hands in any frame). It is excluded from this
  workstream and is not an anomaly case.

## 2. Method

- `frame_diagnostics.py` reads the stored IMAGE-mode landmarks for every dynamic frame. For each hand it records presence,
  wrist-to-knuckle size, bounding-box span, wrist position, the step since the previous frame (in hand-size units and in
  image units), and wrist position relative to the frame edge.
- Symptom flags (not causes): `size_low` (< 0.03), `size_high` (> 0.6), `collapsed_span` (< 0.02), `jump` (> 1.5 hand-sizes
  in one frame), `abs_jump` (> 0.25 image units in one frame), `wrist_at_edge` (within 2% of a border).
- `anomaly_report.py` groups consecutive flagged frames into runs and assigns a cause label. Visual checks override rules.
  **Nothing is deleted.** Every run is kept and labelled.

Cause labels:

| Label | Meaning |
| --- | --- |
| CONFIRMED_DETECTOR_FAILURE | the image shows a hand the landmarks misrepresent (visual check) |
| POSSIBLE_DETECTOR_FAILURE | visual or rule evidence of a detector error, not proven |
| POSSIBLE_GENUINE_VARIATION | motion or pose that may be real signing |
| CAMERA_FRAMING | the wrist is at or beyond a frame edge |
| UNCERTAIN | no visual check, and the rule cannot decide |

## 3. Results

- Frames: 1,120 (28 classes x 40). Per-frame flags: see `reports/frame_diagnostics.csv`.
- Anomaly runs: **68**. Labels: 22 possible genuine variation, 18 possible detector failure, 13 uncertain,
  10 camera framing, **5 confirmed detector failure**.
- Visual checks recorded: **11 runs** across 7 frames of 5 classes (`seat` 29–30, `open` 10 and 35, `book` 9, `team` 5 and 14,
  `practice` 35). `open` 10 is a reference frame, not an anomaly.
- Recapture tiers: **HIGH** book, open, practice, seat, team (5). **MEDIUM** break, congratulations, good morning,
  how are you, please (5). **LOW** i need help, this (2). **NONE** the other 16 classes.

### 3.1 Confirmed and probable failure modes (the high-priority classes)

**Verified by visual check (one reviewer, still images):**

1. **`seat` frames 29–30: handedness relabel and missed detection.** Both hands are visible in both frames. The image-right
   hand sits in the same place in both frames but is labelled `Left` in frame 29 and `Right` in frame 30. The other hand
   is not reported in frame 30. Stored absolute steps in the right slot are about **0.70–0.72 image units** in frames 30–35
   (median 0.005 across the clip). The `Right` slot therefore alternates between two physical hands. This corrupts any
   slot-based feature, including the per-frame blocks used by DTW.
2. **`open` frame 35: collapsed landmarks.** The hand is clearly visible at normal size. Its wrist-to-knuckle distance is
   about **0.008**. Frame 10 of the same clip, with a visible hand of the same kind, gives about **0.12**. The right-slot
   size is below 0.03 in 14 frames, and the right wrist moves 0.11–0.12 image units in frames 35–39.
3. **`book` frame 9: missed hand.** Two palm-up hands are visible. One hand is reported, with a collapsed size of 0.015.

**Probable, but not proven (occlusion):**

4. **`team` frames 5 and 14.** Hands are clasped or overlapping in front of the body. One hand is reported with size
   0.0039 (frame 5) or 0.0074 (frame 14). This may also be a genuine pose: **ISL review is needed before deciding.**
5. **`practice` frame 35.** Two hands are interlocked. Left size is 0.029. Interlocking may be part of the sign.

### 3.2 Rule-based runs (no visual check)

- **`break` and `congratulations`:** three left-hand steps above 0.25 each. Possible identity or tracking jumps.
- **`how are you` and `good morning`:** the wrist sits at the frame edge in 5 and 2 frames respectively. This is camera framing.
- **`please`:** the left wrist sits at the frame edge in 6 frames. This is camera framing in a left-only phrase.
- **`i need help` and `this`:** minor jumps only. Kept.

### 3.3 Hand configuration of the seven classes without two-hand frames

These classes must not be forced into two-hand recognition. The configuration is recorded here as found in the data:

| Phrase | Hand in data | Two-hand frames | Note |
| --- | --- | ---: | --- |
| good morning | right only (39 frames) | 0 | right wrist at edge in 2 frames |
| join | left only (40 frames) | 0 | |
| please | left only (40 frames) | 0 | left wrist at edge in 6 frames |
| sun | right only (40 frames) | 0 | |
| thirsty | right only (40 frames) | 0 | |
| wait | left only (40 frames) | 0 | |
| this | **alternating**: left in 16 and right in 24 frames | 0 | one hand at a time; 6 presence changes |

`this` is the unusual case: it is not one-handed in every frame, but the two hands never appear together. A recognizer
that assumes both hands are present would misread it. Recording protocol item (section 4 of `recording_protocol.md`)
asks for this configuration to be recorded explicitly.

### 3.4 Other classes with two-hand data

Counts of frames with left / right / both hands are in the table below. `Presence changes` counts frames where a hand
appears or disappears from the previous frame. Values from 12 to 19 in several classes (`book`, `team`, `email`, `pressure`,
`how are you`) mean that hands enter and leave the frame often. That is either genuine (hands moving out of the frame)
or detector dropout. This study cannot separate the two without visual review of each clip.

## 4. Per-class table

Recommendations apply to the next recording round. They are not decisions to delete anything.

| Phrase | Left / right / both frames | Hand configuration (as found) | Presence changes | Symptom flags | Tier | Recapture recommendation |
| --- | --- | --- | ---: | --- | --- | --- |
| again | 40 / 40 / 40 | two hands | 0 | none | NONE | keep |
| agree | 40 / 35 / 35 | two hands (left alone in 5 frames) | 4 | none | NONE | keep |
| answer | 40 / 40 / 40 | two hands | 0 | none | NONE | keep |
| attendance | 11 / 40 / 11 | right hand; left in 11 frames | 8 | none | NONE | keep; confirm the intended left-hand role |
| book | 12 / 24 / 6 | both hands, intermittent | 19 | left jump x1, size_low x3; right jump x1, size_low x2 | **HIGH** | **recapture**: both hands clearly visible; confirmed missed hand (frame 9) |
| break | 40 / 29 / 29 | left always; right in 29 | 13 | left abs_jump x3 | MEDIUM | keep; review the three left-hand steps |
| congratulations | 40 / 6 / 6 | left always; right in 6 | 12 | left abs_jump x3, jump x3 | MEDIUM | **recapture**: right hand in only 6 frames; three left-hand jumps |
| email | 40 / 20 / 20 | left always; right in 20 | 16 | none | NONE | keep; confirm the intended right-hand timing |
| file | 37 / 25 / 22 | left in 37; right in 25 | 9 | none | NONE | keep |
| good morning | 0 / 39 / 0 | **right only** | 2 | right abs_jump x1, wrist_at_edge x2 | MEDIUM | **recapture**: keep the right hand inside the frame |
| home | 14 / 38 / 14 | right in 38; left in 14 | 13 | none | NONE | keep |
| how are you | 28 / 32 / 20 | both hands, intermittent | 15 | left abs_jump x1, jump x1; right abs_jump x1, jump x2, wrist_at_edge x5 | MEDIUM | **recapture**: framing (right wrist at edge in 5 frames); two steps above 0.25 |
| i need help | 6 / 35 / 6 | right in 35; left in 6 | 16 | left jump x1; right jump x1 | LOW | keep |
| join | 40 / 0 / 0 | **left only** | 0 | none | NONE | keep; document the one-hand configuration |
| meet | 40 / 40 / 40 | two hands | 0 | none | NONE | keep |
| open | 33 / 38 / 33 | both hands, intermittent | 8 | right jump x9, size_low x14 | **HIGH** | **recapture**: confirmed collapsed landmarks (frame 35); right hand size below 0.03 in 14 frames |
| pass | 40 / 40 / 40 | two hands | 0 | none | NONE | keep |
| please | 40 / 0 / 0 | **left only** | 0 | left wrist_at_edge x6 | MEDIUM | **recapture**: keep the left hand inside the frame |
| practice | 32 / 32 / 24 | both hands, intermittent | 16 | left jump x3, size_low x1; right jump x2 | **HIGH** | **recapture** with hands separated where the sign allows; reviewer to confirm whether interlocking is part of the sign |
| pressure | 21 / 40 / 21 | right always; left in 21 | 15 | none | NONE | keep |
| seat | 36 / 40 / 36 | both hands; right always | 4 | right abs_jump x4, jump x4 | **HIGH** | **recapture**: confirmed right-slot relabel and missed hand (frames 30–35) |
| sun | 0 / 40 / 0 | **right only** | 0 | none | NONE | keep; document the one-hand configuration |
| team | 35 / 8 / 5 | left mostly; right in 8 | 18 | left jump x11, size_low x6; right size_low x2 | **HIGH** | **recapture and ISL review**: interlocked or occluded hands (frames 5, 14); 18 presence changes |
| thirsty | 0 / 40 / 0 | **right only** | 0 | none | NONE | keep; document the one-hand configuration |
| this | 16 / 24 / 0 | **alternating** (one hand at a time) | 6 | left jump x1, right jump x1 | LOW | keep; document the alternation |
| together | 40 / 2 / 2 | left always; right in 2 | 4 | none | NONE | keep; confirm the intended two-hand part |
| wait | 40 / 0 / 0 | **left only** | 0 | none | NONE | keep; document the one-hand configuration |
| where | 40 / 40 / 40 | two hands | 0 | none | NONE | keep |

## 5. Verified facts, experimental findings and hypotheses

**Verified (checked directly in the data or the image):**
- 28 dynamic classes, 40 frames each, including `open`.
- Frame-level flags and runs as listed; the counts in section 3 are reproducible from `frame_diagnostics.py`.
- `seat` 29–30 and `open` 35 contradict the image as described.
- `book` 9 shows two hands in the image, with one hand reported.
- Seven classes have no two-hand frames, and `this` alternates between hands.

**Experimental findings (single reviewer, rule-based, or dataset-internal):**
- Most anomaly runs are rule-based. Their labels are not verified.
- The 13 abs_jump frames (`break`, `congratulations`, `good morning`, `how are you`, `seat`) are the only steps above 0.25 image units.

**Hypotheses (not yet tested):**
- The collapsed hand sizes in `open`, `team`, `book` and `practice` may inflate the motion measure of their windows, because motion is normalised by hand size. This could push some dynamic windows upward on the motion measure. A test would recompute motion in absolute image units.
- Handedness relabelling (as in `seat`) may occur more often than the rule finds. The rule only sees large steps. A test would track each physical hand by position and count label changes.
- Frame order is not known to be time order. A frame step of 0.7 image units may be a detector jump or a long gap between sampled frames. A test would need the original video timestamps, which the stills do not provide.
