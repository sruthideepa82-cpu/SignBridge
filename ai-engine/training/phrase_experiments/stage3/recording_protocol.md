# Multi-signer recording protocol (Stage 3, Workstream B) — DRAFT, not approved for collection

> **No recording may be made under this protocol until consent, ethics approval, licence terms and a reviewer are in
> place, and the project owner has approved collection in writing.** Stage 3 authorised this design only.

## 1. Purpose and limits

- Produce original, timestamped videos of the 28 dynamic phrase classes from several signers, so that a future evaluation
  can separate signers, sessions and clips.
- Target from the brief: **5 signers, 5 recordings per phrase per signer, 28 phrases, 700 recordings.** This is an initial
  collection target. It is not evidence that the number is statistically sufficient.
- **No ISL meaning is defined here.** Each phrase label is the label from the Stage 0 manifest and is unverified. Signers and
  an ISL reviewer decide whether the performed sign matches the label. A disagreement is recorded as a dispute, never silently
  relabelled.
- Nothing in this protocol claims ISL translation, accuracy or generalisation.

## 2. Consent, ethics and licensing (complete before any collection)

1. **Written informed consent** from every signer, in a language the signer understands. The form states: the purpose
   (college research on sign-recognition experiments), what is recorded (video of the upper body and hands, with the face
   visible unless the signer agrees otherwise), how long it is kept, who has access, that the signer may withdraw at any time,
   and what happens to data after withdrawal.
2. **Separate consent** for each use: research training, internal evaluation, any publication or redistribution. Redistribution
   is off by default.
3. **Consent record** per signer: consent form version, date, signature or dated acknowledgement, scope, status (`granted`,
   `pending`, `withdrawn`). The schema field `consent_status` must be `granted` before any recording from that signer is used.
4. **Withdrawal:** the signer's recordings are removed from working copies and the withdrawal is recorded. Do not republish
   anything derived from them.
5. **Ethics approval:** obtain the college's own research-ethics approval before collection. The approval reference is recorded
   in the project record. This document does not supply one.
6. **Minors:** excluded unless the ethics approval explicitly covers them.
7. **Dataset licence:** the existing image archive has no licence file (`dataset_license_status: unknown`). Any new recordings
   are `internal_research_only` until a licence agreement is signed. Redistribution requires `redistributable`.
8. **Storage:** encrypted storage on a machine controlled by the project; no upload to third-party services; checksums recorded.
9. **Identity:** signers appear in metadata only as pseudonymous IDs (`S01`…). The mapping of pseudonyms to people is held
   separately, under access control, and never placed in the recording metadata or the repository.

## 3. Signers

- Target: 5 signers, recruited with the consent process above. Prefer signers with ISL experience, and include at least one
  signer who is a deaf ISL user if the ethics approval allows. Record only self-reported attributes that the signer agrees to.
  Do not infer any attribute from appearance.
- Each signer records every phrase in at least two sessions on different days.
- Record the **hand configuration each signer naturally uses** (`one_hand_right`, `one_hand_left`, `two_hands`,
  `alternating`, `unknown`). Do not ask a signer to use a configuration that is not their own.

## 4. Sessions and conditions

- **Sessions:** at least two per signer. Vary at least one of: camera distance, camera position, lighting. Record the session ID
  (`SES-NNN`) and the conditions on each recording.
- **Camera:** a fixed webcam or a fixed phone camera. Use a minimum of 640 x 480. Preferably use the same resolution and
  webcam type as Live Studio, and add one alternate camera setup per signer.
- **Frame rate:** record the frame rate reported by the device and measure it from the capture timestamps. Store both
  (`original_fps`, `fps_status`). A recording with no measured frame rate is rejected.
- **Distance:** 80 to 150 cm for most sessions, and at least one session at 200 cm to test small hands in frame.
- **Lighting:** daylight, indoor artificial, and mixed. Note low light as a separate condition.
- **Background:** plain wall preferred. Record any clutter or second person as a condition.

## 5. Recording procedure (per clip)

1. Signer stands or sits in the marked area, hands resting, for **2 seconds** before the sign (pre-roll).
2. Signer performs the phrase once, naturally, at their normal speed. Then one slower repetition and one faster repetition
   in separate takes, to capture the speed variation the classes can have. Do not exaggerate.
3. The sign must be complete: start at rest, end at rest. No cutting of the movement.
4. Hands return to rest for **2 seconds** after the sign (post-roll).
5. Record the **original video**. Do not store only selected still frames. Do not edit, crop or re-encode the original.
6. Each take is a separate recording with its own `recording_id`, even when several takes are made in one minute.
7. The original file is hashed (SHA-256) at capture time and the hash is stored in the metadata.

Repetitions: **5 per phrase per signer** (for example 2 normal, 1 slow, 1 fast, and 1 in a second session), spread over the
sessions. The mix is recorded so that the speed variation can be analysed later.

## 6. Negative and boundary recordings (separate session)

These are needed before any rejection claim can be tested. They are recorded under the same consent and in their own
sessions:

- **Unrelated hand movements** (no target sign), for example scratching, adjusting clothing, gesturing toward the camera.
- **Non-sign gestures** and **static poses** not in the phrase list.
- **No-hand** segments (the signer's hands out of frame) for the same duration.
- **Incomplete gestures**: a target sign stopped half-way, labelled as incomplete.
- **Ambiguous gestures**: any movement an annotator cannot decide. Record the dispute.
- **Other legitimate ISL signs** that are not in the 28 phrases. Their status is decided during annotation, not assumed.
  A sign that is a legitimate ISL sign is not an automatic negative.

## 7. Annotation

- Two independent annotators mark the start and end of each sign by **timestamp** (seconds from the start of the file).
  Each annotation records `annotator_id`, `annotation_confidence` (`high`, `medium`, `low`) and `dispute_note`.
- A reviewer (`REV-NN`) resolves disagreements. An ISL signer or interpreter reviews the phrase label for each class and
  decides whether the performed sign matches it. The reviewer does not change labels silently: a mismatch is recorded as a
  dispute with the evidence.
- Unclear or disputed gestures are kept in the data with their dispute note.

## 8. Quality review (before a recording is accepted)

A recording is `accepted` only if all the following hold, and `rejected` otherwise with the reason recorded:

- both hands (or the one hand that the signer uses) are fully inside the frame for the sign, including the wrist;
- the sign is complete, with pre- and post-roll;
- the image is sharp and not heavily compressed;
- the frame rate is stable and recorded;
- no second person enters the sign area, or it is recorded as a condition;
- the consent status is `granted`.

Use `needs_review` when a reviewer cannot decide. Do not discard footage that is only partly usable; record the partial
usability in the annotation.

## 9. Storage, naming and integrity

- Original files are write-once. They are never renamed, re-encoded or overwritten.
- File names use the `recording_id`, not the phrase label, so that signer or phrase cannot be read from the file name.
- One metadata JSON per recording, validated against `recording_metadata_schema.json` before it is stored.
- A collection manifest lists every recording with its SHA-256 and validation status. The manifest is regenerated, never edited by hand.
- The dataset version for recordings is `isl_dynamic_recordings_v1`, kept separate from `isl_phrases_v2_stage0`.

## 10. Counting and balance

- Track recordings per phrase, signer, session and condition. Do not let one signer or one session dominate a phrase.
- A phrase with fewer than the target count after the collection round is listed as incomplete. It is not padded with
  copies.

## 11. What this protocol does not do

- It does not define ISL sign forms.
- It does not select signers on any attribute other than consent and the agreed inclusion criteria.
- It does not connect to the SignBridge camera or the live recognizer. A separate, approved tool would do the capture
  (see `future_recording_tool_design.md`).
- It does not publish data or models.
