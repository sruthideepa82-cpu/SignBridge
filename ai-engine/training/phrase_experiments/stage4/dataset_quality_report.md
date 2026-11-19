# Dataset quality report (Stage 4)

> Categories come from Stage 3 automated labels and visual checks. **No sample has been reviewed by an independent
> human reviewer.** Nothing has been removed or modified. Every category is provisional.

## Totals

- Dynamic frames checked: 1120 (28 classes x 40).
- Flagged samples (one row per frame, hand and flag): 95.
- Frames with at least one flag: 72; frames with no flag: 1048.
- Samples with independent human review: **0**.

## Categories (flagged samples)

| Category | Count | Meaning |
| --- | ---: | --- |
| 1. Confirmed detector failure | 5 | visual check shows the landmarks contradict the image (one automated reviewer, still image) |
| 2. Possible detector failure | 30 | visual or rule evidence of a detector error, not proven |
| 3. Possible genuine signer variation | 26 | motion or pose that may be real signing |
| 4. Camera/framing problem | 13 | wrist at or beyond the frame edge |
| 5. Uncertain anomaly | 21 | no visual check, and the rule cannot decide |
| 6. Unreviewed samples | all 1,120 frames | no independent human review has been done for any frame |

By review priority: HIGH 63, MEDIUM 27, LOW 5.

## Stage 3 visual checks (automated reviewer, still images)

11 rows. Each needs independent human confirmation.

| Review ID | Class | Frame | Hand | Flag | Stage 3 finding |
| --- | --- | ---: | --- | --- | --- |
| HR-0001 | book | 9 | left | size_low | Two palm-up hands visible. Only one hand is reported (left, collapsed size 0.015). |
| HR-0049 | open | 35 | right | jump | Hand clearly visible at normal size. Stored wrist-to-knuckle distance is about 0.008; frame 10 of the same clip, with a visible hand of the same kind, gives about 0.12. |
| HR-0050 | open | 35 | right | size_low | Hand clearly visible at normal size. Stored wrist-to-knuckle distance is about 0.008; frame 10 of the same clip, with a visible hand of the same kind, gives about 0.12. |
| HR-0063 | practice | 35 | left | jump | Two hands interlocked. Left size 0.029. Occlusion is likely; interlocking may be a genuine part of the sign. |
| HR-0064 | practice | 35 | left | size_low | Two hands interlocked. Left size 0.029. Occlusion is likely; interlocking may be a genuine part of the sign. |
| HR-0067 | seat | 30 | right | abs_jump | Both hands visible in both frames. The image-right hand is in the same place in frames 29 and 30 but is labelled Left in frame 29 and Right in frame 30. The other hand is not reported in frame 30. |
| HR-0068 | seat | 30 | right | jump | Both hands visible in both frames. The image-right hand is in the same place in frames 29 and 30 but is labelled Left in frame 29 and Right in frame 30. The other hand is not reported in frame 30. |
| HR-0076 | team | 5 | left | jump | Hands clasped and interlaced. One hand reported with size 0.0039. May also be a genuine pose: ISL review needed. |
| HR-0077 | team | 5 | left | size_low | Hands clasped and interlaced. One hand reported with size 0.0039. May also be a genuine pose: ISL review needed. |
| HR-0081 | team | 14 | left | jump | Hands overlap in front of the body. One hand is reported with collapsed size 0.0074. Occlusion is likely. |
| HR-0082 | team | 14 | left | size_low | Hands overlap in front of the body. One hand is reported with collapsed size 0.0074. Occlusion is likely. |

## Per-class counts

| Class | Flagged samples | Categories |
| --- | ---: | --- |
| again | 0 | none |
| agree | 0 | none |
| answer | 0 | none |
| attendance | 0 | none |
| book | 7 | 1. Confirmed detector failure x1; 3. Possible genuine signer variation x2; 5. Uncertain anomaly x4 |
| break | 3 | 2. Possible detector failure x3 |
| congratulations | 6 | 2. Possible detector failure x6 |
| email | 0 | none |
| file | 0 | none |
| good morning | 3 | 2. Possible detector failure x1; 4. Camera/framing problem x2 |
| home | 0 | none |
| how are you | 10 | 2. Possible detector failure x4; 3. Possible genuine signer variation x1; 4. Camera/framing problem x5 |
| i need help | 2 | 3. Possible genuine signer variation x2 |
| join | 0 | none |
| meet | 0 | none |
| open | 23 | 1. Confirmed detector failure x2; 2. Possible detector failure x1; 3. Possible genuine signer variation x8; 5. Uncertain anomaly x12 |
| pass | 0 | none |
| please | 6 | 4. Camera/framing problem x6 |
| practice | 6 | 2. Possible detector failure x2; 3. Possible genuine signer variation x4 |
| pressure | 0 | none |
| seat | 8 | 1. Confirmed detector failure x2; 2. Possible detector failure x6 |
| sun | 0 | none |
| team | 19 | 2. Possible detector failure x7; 3. Possible genuine signer variation x7; 5. Uncertain anomaly x5 |
| thirsty | 0 | none |
| this | 2 | 3. Possible genuine signer variation x2 |
| together | 0 | none |
| wait | 0 | none |
| where | 0 | none |

## Corrections applied at register level (Stage 3 files unchanged)

- Stage 3 labelled whole anomaly runs CONFIRMED when only one frame in the run was visually checked. In this register,
  CONFIRMED is given only to the visually checked frames. Other frames of those runs are POSSIBLE_DETECTOR_FAILURE.
- `seat` frame 29 was part of the visual check but has no flag, so it has no register row. Frame 29 is listed in
  the Stage 3 visual-check text only. Its review is still needed.
- `open` frame 10 is a reference frame with no flag and is not in the register.

## Not claimed

- No ISL meaning, verification or approval.
- No accuracy, generalisation or signer independence.
- No removal or modification of any sample.
