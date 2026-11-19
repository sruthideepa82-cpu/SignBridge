# Future recording tool: design (Stage 3, optional, design only)

> **Not implemented. Not connected to SignBridge.** This is an architecture for a separate, isolated tool, to be
> approved before any code is written. It must not use the SignBridge camera service, the shared MediaPipe pipeline,
> the backend routes or the frontend.

## 1. Purpose

Capture original video of the 28 dynamic phrases from consenting signers, with per-frame timestamps and metadata that
match `recording_metadata_schema.json`, so that the recording protocol can be run reproducibly.

## 2. Required capabilities

| Capability | Requirement |
| --- | --- |
| Camera preview | live preview from a chosen webcam, with frame-size and approximate frame-rate display |
| Phrase selection | list from `phrase_catalog.json` (IDs `DYN-01`…`DYN-28`); the label is shown, never typed freely |
| Signer selection | pseudonymous IDs only (`S01`…); refuses to record for a signer whose consent is not `granted` |
| Session | a session ID (`SES-NNN`) and the recorded conditions (distance, position, lighting) |
| Start and stop | operator-controlled; pre-roll and post-roll of 2 seconds are recorded in the file |
| Original storage | the camera stream written as the original video file, with no re-encoding of the captured frames |
| Timestamps | a per-frame capture timestamp written to a sidecar file, so the measured frame rate is known |
| Frame-rate metadata | `original_fps` measured from timestamps, and `fps_status` set to `measured` or `device_reported` |
| Checksum | SHA-256 of the finished original file, written at capture |
| Metadata export | one JSON per recording, validated against the schema before it is written |
| Quality review | playback with the annotation timeline; accept, reject (with reason) or needs-review |
| Consent tracking | a consent record per signer (form version, date, status); status changes are logged, never edited in place |
| Write-once | an original file, once closed, is never overwritten; corrections create a new annotation, not a new original |

## 3. Architecture

```
+------------------------------------------------------------------+
| Recording tool (standalone process, separate directory)          |
|                                                                  |
|  UI layer           Phrase / signer / session selection          |
|                     Preview, start, stop, review                 |
|                                                                  |
|  Capture layer      Webcam reader (OpenCV VideoCapture)          |
|                     Timestamp per frame (monotonic clock)        |
|                     Writer: original video file (no re-encode    |
|                     of the stream beyond the container)          |
|                                                                  |
|  Metadata layer     Recording record builder (schema)            |
|                     Consent registry (read-only check)           |
|                     Checksum (SHA-256)                           |
|                                                                  |
|  Storage layer      Recordings root (encrypted, write-once)      |
|                     Collection manifest (regenerated)            |
+------------------------------------------------------------------+
        no link to: backend/, frontend/, shared MediaPipe, sign-to-voice
```

- **No MediaPipe at capture.** Landmarks are extracted later, by the existing offline pipeline, with the same settings used
  for the stills. Running a detector during capture would change the timing and the data.
- **No network.** The tool does not upload anything.
- **Separate environment.** Its own virtual environment, so the backend and ai-engine dependencies do not change.

## 4. Dependencies (for approval)

| Dependency | Purpose | Status |
| --- | --- | --- |
| OpenCV (`opencv-python`) | camera capture and video writing | already present in the backend environment; a separate environment would install its own copy |
| Python standard library (`json`, `hashlib`, `pathlib`, `time`, `datetime`) | metadata, checksums, timing | available |
| A GUI toolkit (for example `tkinter`, bundled with standard Python on Windows) | preview and controls | standard library; a heavier toolkit would need approval |
| `jsonschema` | strict schema checking | **not installed**; the Stage 3 validator implements the rules with the standard library instead |

No dependency is installed by this design.

## 5. Consent and safety controls

- The tool refuses to start a recording unless the selected signer has consent status `granted` in the consent registry.
- Consent registry entries are append-only. A withdrawal creates a new entry and flags the signer's recordings for removal.
- The tool shows the consent form version and the operator's name in the session log.
- Signer names are never stored. The pseudonym-to-person mapping is not part of the tool.

## 6. Quality controls

- Warn when the measured frame rate varies by more than an agreed tolerance across the clip.
- Warn when the resolution is below 640 x 480.
- Warn when the recording is shorter than pre-roll plus post-roll plus a minimum sign duration.
- Show the first frame and last frame in the review screen so the reviewer can check the start and end positions.

## 7. Outputs

- `REC-NNNN.<container>`: the original video, write-once.
- `REC-NNNN.timestamps.csv`: frame index and capture time in seconds.
- `REC-NNNN.json`: metadata matching the schema, with `original_sha256`.
- Collection manifest: one row per recording with validation status and checksum status.

## 8. Testing plan (if approved)

- Unit tests for timestamp-based frame-rate measurement, using a synthetic clock.
- Schema validation tests against the Stage 3 validator, including the failure cases already in the test suite.
- A dry run with a synthetic camera source. **No real participant recording is made during testing.**
- Checksum test: the stored hash matches the file after a copy.

## 9. Open decisions

- Choice of container and codec for the original files, which must preserve the stream without quality loss.
- Whether the operator needs an authentication step.
- Storage location and encryption method, which depend on the ethics approval.
- Whether a separate GUI toolkit is worth its dependency cost.

Nothing in this design is approved. Implementation requires explicit approval after the consent, ethics and licence steps are complete.
