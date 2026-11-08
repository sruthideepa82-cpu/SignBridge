# SignBridge --- Master Project Plan

> **Purpose of this document:** This is the single source of truth for
> OpenCode and all contributors working on SignBridge. Read this file
> before changing code. Keep it updated as implementation decisions,
> features, tests, and project status change.
>
> **Project name:** SignBridge\
> **Project type:** Academic capstone / accessibility-focused AI
> application\
> **Primary target language:** Indian Sign Language (ISL)\
> **Current development stage:** Phase 0 and Phase 1 are complete. Phase 2
> (MediaPipe hand-landmark detection) is implemented and its automated and
> hardware tests pass (verified 2026-11-08, see Section 6). Live manual
> checks listed in Section 6 are still open, so Phase 2 is not yet closed.

------------------------------------------------------------------------

## 1. Executive Summary

SignBridge is an accessibility-focused application intended to help
bridge communication between people who use sign language and people who
do not understand it.

The intended experience is:

1.  A user opens SignBridge and starts a webcam session.
2.  The application captures live video.
3.  Computer-vision components detect hands and extract hand landmarks.
4.  A recognition model interprets supported ISL signs or sign
    sequences.
5.  Recognized content is converted into readable text.
6.  Text-to-speech can speak the translated text aloud.
7.  A separate learning module helps users learn and practise supported
    signs.

The long-term product vision includes hand tracking, relevant
facial/non-manual features, dynamic sign recognition, sentence
construction, optional language-model-assisted text processing,
text-to-speech, and an interactive learning experience.

**SignBridge must not be represented as a complete sign-language
translator until it has been trained, evaluated, and validated for a
clearly defined ISL vocabulary and usage context.** Hand detection is
not sign-language understanding. A hand-landmark detector identifies
body points; a separate recognition system must learn what signs mean.

------------------------------------------------------------------------

## 2. Problem Statement

People who communicate using sign language can encounter barriers when
interacting with people who do not know that language. Existing
communication tools may not provide accessible, real-time support for
the specific signs, language, and context used by the people
communicating.

SignBridge aims to provide a practical software platform that explores
computer-vision-based recognition of a defined set of Indian Sign
Language signs and makes recognized content available as text and
speech. It also aims to provide a learning interface for people who want
to learn the supported signs.

The system is intended to support communication and accessibility. It is
not a replacement for qualified interpreters, and it must communicate
its limitations clearly.

------------------------------------------------------------------------

## 3. Goals and Non-Goals

### 3.1 Primary goals

-   Provide a responsive React web application.
-   Capture webcam video through the existing OpenCV/FastAPI pipeline.
-   Detect up to two hands using MediaPipe.
-   Extract 21 landmarks per detected hand, including normalized x, y,
    and z values.
-   Display annotated frames and useful detection status in the
    frontend.
-   Build a documented, reproducible dataset collection workflow for a
    carefully selected ISL vocabulary.
-   Train and evaluate a real gesture-recognition model using
    collected/approved data.
-   Convert supported predictions into text.
-   Add text-to-speech for translated text.
-   Build an interactive learning module for supported signs.
-   Test, document, and package the project so another developer can run
    it.

### 3.2 Longer-term goals

-   Recognize dynamic signs using sequences of landmark frames.
-   Investigate relevant non-manual features, including facial
    expression, head movement, and upper-body posture, where supported
    by suitable data and ethical consent.
-   Develop sequence segmentation and sentence-level interpretation.
-   Explore language-model-assisted text normalization or sentence
    construction only after reliable recognition and with safeguards
    against invented meaning.
-   Add user accounts and learning progress persistence.
-   Deploy a demonstrable version with a clear distinction between local
    webcam capture and remote server deployment.

### 3.3 Non-goals for the initial version

-   Do not claim support for all ISL signs or all sign languages.
-   Do not claim fluent continuous sign-language translation from a
    small alphabet dataset.
-   Do not treat ASL alphabet data as ISL data.
-   Do not use hardcoded predictions, random outputs, prerecorded video,
    or fabricated landmark coordinates as if they were real inference.
-   Do not send raw webcam images or identifiable video to an external
    LLM by default.
-   Do not add a database, authentication, cloud infrastructure, or
    complex model architecture before the core workflow requires it.
-   Do not interpret facial emotion as equivalent to linguistic
    facial/non-manual markers.

------------------------------------------------------------------------

## 4. Product Scope and Main Modules

### Module A --- Landing Page and Application Shell

**Purpose:** Introduce SignBridge and provide navigation.

Expected content: - SignBridge branding and navigation. - Hero
statement: "Breaking Barriers. Connecting People." - Short explanation
of the product. - Calls to action for Translator and Learning. - Feature
overview: recognition, sign-to-text, text-to-speech, and learning. -
How-it-works section. - About section and footer. - Responsive layout
for desktop and mobile.

Routes currently planned: - `/` --- landing page - `/translator` ---
camera and translation workspace - `/learn` --- learning module

Keep navigation functional. Avoid broken external image URLs. Prefer
local assets, CSS illustrations, or reliable icon components.

### Module B --- Webcam and OpenCV Capture

**Purpose:** Acquire real camera frames.

Expected behavior: - Start and stop camera controls. - Use OpenCV
(`cv2`) for backend camera capture in the current local-development
architecture. - Stream frames to the browser using MJPEG through
FastAPI. - Report camera unavailable, permission, busy-device, and
stream errors clearly. - Prevent multiple simultaneous camera
instances. - Release the camera when stopped and during application
shutdown. - Keep capture and inference services modular.

Important architecture limitation: - A Python backend running on a
user's own computer can access that computer's webcam. - A backend
deployed on a remote server generally cannot access the visitor's local
webcam. - For public deployment, consider browser-side `getUserMedia()`
and sending frames/landmarks to the backend, or run inference in the
browser. Do not assume a cloud backend can open the user's webcam.

### Module C --- MediaPipe Hand Landmark Detection

**Purpose:** Detect hand structure, not hand meaning.

Expected behavior: - Reuse the existing OpenCV capture service. -
Convert frames from BGR to RGB before MediaPipe inference. - Initialize
the detector once and reuse it; do not initialize it for every frame. -
Support up to two hands. - Detect 21 landmarks per hand. - Expose
handedness classification where available. - Return normalized x, y, z
coordinates for each landmark. - Draw landmark points and connections on
annotated frames. - Display hand count, detection status, handedness,
and coordinates in the UI. - When no hand is present, report zero hands
and an empty landmark list. - When a hand disappears, update the UI
rather than retaining stale coordinates as current detections. - Handle
detector errors and camera shutdown cleanly.

Suggested landmark payload (illustrative schema; adapt to existing
code):

``` json
{
  "hands_detected": 1,
  "hands": [
    {
      "handedness": "Right",
      "score": 0.98,
      "landmarks": [
        { "index": 0, "name": "WRIST", "x": 0.5, "y": 0.8, "z": 0.0 }
      ]
    }
  ]
}
```

The example contains only one landmark to illustrate the schema. Actual
detections must include all 21 landmarks per hand. Do not hardcode the
example values.

Performance and concurrency: - Avoid blocking FastAPI's event loop with
long-running capture or inference work. - Use a safe threading/worker
strategy or suitable async integration. - Protect shared camera and
detector state with appropriate locks. - Ensure the MJPEG stream and
structured landmark endpoint read a consistent latest result. - Avoid
running duplicate inference loops for each frontend request if a single
shared processing loop is appropriate. - Keep frame rate and resolution
configurable. - Avoid unbounded queues and memory growth.

### Module D --- Dataset Collection

**Purpose:** Create real, labeled examples for the recognition model.

This module must be designed before training a classifier.

Requirements: - Define a vocabulary based on verified ISL references and
project scope. - Record the source/reference for each sign definition. -
Do not assume that English letters or ASL labels correspond to ISL
signs. - Create a collection tool that records landmark sequences or
frames with labels. - Capture samples from multiple participants where
possible, with informed consent. - Include variation in hand size, skin
tone, lighting, background, camera angle, handedness, and signing
speed. - Store metadata such as label, participant/session identifier
(pseudonymous), capture date, camera settings, and sequence length. -
Avoid storing raw video unless necessary and consented to. Prefer
landmark data for the first model. - Separate training, validation, and
test data by signer/participant where possible to reduce identity
leakage. - Keep test data held out from training and tuning. - Record
class counts and dataset limitations.

Suggested organization:

``` text
ai-engine/
  dataset/
    raw/
    processed/
    metadata/
    README.md
  collection/
    collect_static.py
    collect_sequences.py
  training/
    prepare_dataset.py
    train_static_classifier.py
    train_sequence_classifier.py
    evaluate.py
  models/
    README.md
```

Do not commit large, private, or consent-restricted datasets to Git.
Document how to obtain or recreate them.

### Module E --- Gesture Recognition

**Purpose:** Map landmark observations to supported sign labels.

Recommended staged approach:

**Stage 1: Static gesture baseline** - Start with a small, clearly
documented set of static signs. - Use normalized landmark features. -
Establish a baseline classifier. - Compare a simple classical model (for
example, Random Forest or SVM) with a neural model only when useful. -
TensorFlow/Keras may be used if a neural model is justified. - Report
per-class precision, recall, F1-score, confusion matrix, and overall
accuracy. - Include an unknown/uncertain result when confidence is too
low.

**Stage 2: Dynamic signs** - Collect ordered sequences of landmarks over
time. - Normalize and pad/mask sequences appropriately. - Evaluate
LSTM/GRU or temporal convolution/Transformer approaches only after
enough sequence data exists. - Include temporal segmentation and a
strategy for detecting sign boundaries. - Evaluate on signers not
present in training data.

Important: - CNNs are usually suited to image inputs; landmark sequences
are naturally temporal/vector inputs. Choose the model based on the
actual representation and dataset, not because a model name sounds
advanced. - A model must be evaluated on held-out participants. - Never
equate model confidence with real-world translation accuracy. - Keep a
model card describing training data, supported labels, limitations, and
evaluation.

### Module F --- Text Formation and NLP / Optional LLM

**Purpose:** Present recognized signs as readable text without changing
intended meaning.

Requirements: - Recognition output should include label, confidence,
timestamp, and relevant sequence information. - Add smoothing/debouncing
so one sign is not appended many times per second. - Provide a way to
correct or remove an accidental prediction. - Clearly distinguish
recognized labels from any post-processed sentence. - Begin with
deterministic, transparent sentence assembly for the limited
vocabulary. - An LLM may later help with punctuation or constrained
wording, but it must not invent missing signs, add unsupported details,
or silently change meaning. - If recognition is uncertain, show
uncertainty rather than asking an LLM to guess. - Do not send video,
images, or personal data to an external model without explicit product
need, user notice, and appropriate privacy controls.

### Module G --- Text-to-Speech

**Purpose:** Speak translated text.

Initial implementation: - Use the browser SpeechSynthesis API where
supported. - Provide play, pause/cancel, and voice/language selection if
practical. - Handle unavailable voices and browser support. - Do not
automatically speak every unstable frame-level prediction. - Speak only
committed text or when the user explicitly requests playback. - Provide
visible text alongside audio.

### Module H --- Interactive Learning Module

**Purpose:** Help users learn the subset of signs supported by the
project.

Potential features: - Categories and sign cards. - Reference image/video
or carefully sourced demonstration. - Label and meaning. - Step-by-step
instruction. - Practice mode using the same recognition pipeline when
appropriate. - Quiz and feedback. - Progress tracking (local first;
database later).

Use verified ISL references. Clearly attribute third-party assets and
comply with licenses. Do not create inaccurate sign demonstrations.

### Module I --- Database and Accounts (Later)

MongoDB is a planned option, not a requirement for the initial
prototype.

Introduce it only when persistence is needed for: - User profiles. -
Learning progress. - Quiz history. - Saved preferences.

Do not store raw biometric video or landmark histories by default.
Minimize collected data and document retention/deletion behavior. Never
put database credentials in frontend code.

------------------------------------------------------------------------

## 5. Technology Stack

Use the following stack unless a concrete compatibility or maintenance
issue requires a documented change.

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend                React + Vite            Web application UI

  Language                JavaScript initially    Frontend logic

  Styling                 Tailwind CSS (if        Responsive styling
                          already configured)     

  Routing                 React Router            Application routes

  Icons                   Lucide React            Interface icons

  Backend                 Python + FastAPI        API and service
                                                  coordination

  ASGI server             Uvicorn                 Run FastAPI

  Camera/image processing OpenCV                  Capture and frame
                                                  handling

  Hand landmarks          MediaPipe               Hand detection and
                                                  landmarks

  ML                      TensorFlow/Keras when   Train and run selected
                          justified               models

  NLP                     Deterministic           Constrained text
                          processing first;       processing
                          optional LLM later      

  Speech                  Browser SpeechSynthesis Text-to-speech
                          API                     

  Database                MongoDB later           Persistent
                                                  user/learning data

  Tests                   Pytest and frontend     Validation
                          test tooling            
  -----------------------------------------------------------------------

### Dependency compatibility

-   Check the actual Python version and operating system before
    installing packages.
-   Pin tested dependency versions in the relevant requirements/lock
    files.
-   MediaPipe and TensorFlow compatibility varies by Python version,
    operating system, and release. Do not blindly install latest
    versions together.
-   If a package is incompatible, investigate and document a compatible
    combination rather than silently changing the project architecture.
-   Avoid installing both TensorFlow and PyTorch unless there is a
    demonstrated need.
-   Keep the first working system lightweight.

------------------------------------------------------------------------

## 6. Current Project State

This section records what has been established in the project
conversation. OpenCode must inspect the repository and verify the
current code before assuming these details are still true.

### Reported/visually demonstrated

-   React/Vite frontend has been created.
-   FastAPI backend has been created.
-   Landing page and `/translator` and `/learn` routes were part of the
    foundation scope.
-   Backend health route `/api/health` was part of the foundation scope.
-   OpenCV webcam capture and MJPEG streaming were added.
-   An earlier frontend error showed `ECONNREFUSED 127.0.0.1:8000`
    because the backend was not reachable at that time. Starting the
    backend resolved the reported connection issue.
-   MediaPipe hand landmark detection was subsequently implemented.
-   Screenshots shared in the project conversation showed a live camera
    feed, annotated hand landmarks, hand status/count information, and a
    landmark panel.
-   The user has visually exercised hand detection with a hand in front
    of the camera.

### Verification log (2026-11-08)

Environment: Windows 11, Python 3.13.5, Node 22.17.0. Backend venv at
`backend\.venv`, frontend installed with `npm ci`. Resolved versions (the
requirements files are not pinned yet): mediapipe 1.2.2,
opencv-contrib-python 5.0.0.93, numpy 2.5.4, fastapi 0.162.2, pydantic
2.14.3, pytest 9.2.0.

Results from actual runs:

-   Backend `python -m pytest`: **31 passed, 3 skipped** (the skipped
    tests are the opt-in hardware tests).
-   Backend `python -m pytest -m hardware` with
    `SIGNBRIDGE_RUN_CAMERA_TESTS=1`: **3 passed** on the real webcam. The
    MJPEG stream returned JPEG frames, the camera was stopped and reopened,
    and the landmark endpoint reported status.
-   Frontend `npm test`: **27 passed** (5 files). `npm run build`:
    **succeeded**.
-   Fix pass, same day (after the defects below were fixed): backend
    `python -m pytest` **47 passed, 3 skipped**; frontend `npm test`
    **32 passed**; `npm run build` **succeeded**. Hardware tests re-run
    after the fix pass: **3 passed**.
-   Diagnostic only (not added to the repo): mirroring the fixture
    `hand_thumb_up.jpg` changed its handedness from Left to Right, but
    mirroring `hand_landmarker_test_image.jpg` left it as Left (score
    0.80 to 0.99). The handedness mirror question is therefore **not
    settled** by these images. It needs a live check with a known hand.

Phase 2 behavior with automated evidence:

-   Camera starts and streams real frames (API tests and hardware test).
-   No hand gives zero hands and an empty list (blank-frame test).
-   One hand gives 21 named landmarks (still-image test).
-   Two hands give 42 landmarks (on a composite still image, not a live
    two-hand session).
-   A hand that is removed clears the result (`ToggleCapture` test that
    switches between a hand image and a blank frame).
-   Restart after stop re-detects hands (lifecycle test).
-   Detector failures are reported without stopping the camera.

Still open:

-   Live handedness correctness for left and right hands.
-   Live two-hand detection with a real camera.
-   Landmarks follow a moving hand.
-   Repeated start/stop soak test (only two cycles are automated).
-   Busy or disconnected camera, checked by hand.
-   Frame rate and latency measurements.
-   Cross-platform behavior (only Windows has been tested).
-   Accuracy of any sign-language recognition model (no model exists yet).

Defects found by code review, and their status after the 2026-11-08
fix pass (each fix has automated tests):

1.  **Stale landmarks on processing errors. Fixed.** A failed frame now
    clears the hands and reports the new `processing_error` status. The
    stream keeps showing the unannotated frame. Tests:
    `test_processing_error_clears_stale_hands`,
    `test_processing_error_clears_after_next_good_frame`.
2.  **Stale landmarks on poll errors. Fixed.** `useHandLandmarks` clears
    its data on failure, and `LandmarkInfoPanel` shows a notice instead of
    coordinates. Tests in `useHandLandmarks.test.jsx` and
    `LandmarkInfoPanel.test.jsx`.
3.  **Settings are not validated. Fixed.** Bounds are enforced with
    pydantic `Field` constraints (`backend/app/core/config.py`). Tests in
    `backend/tests/test_settings.py`.
4.  **Shutdown race. Fixed.** `shutdown()` leaves the detector open if a
    camera thread is still alive. Test:
    `test_shutdown_keeps_detector_open_while_capture_thread_is_stuck`.
5.  **Dependencies unpinned. Fixed.** Direct dependencies are pinned in
    `backend/requirements.txt` and `requirements-dev.txt`. The pins were
    checked with `pip install --dry-run`. Transitive packages are not
    pinned.
6.  **Documentation numbering.** Open. `docs/DEVELOPMENT_PLAN.md` now has a
    note pointing to this file, and the README roadmap uses this file's
    numbering. The two documents have not been merged.

### Current milestone

**Phase 2 --- MediaPipe hand landmark detection: implemented; automated
and hardware tests pass; live manual checks and the defects listed above
are still open.**

The next milestone is to close Phase 2 (fix the stale-landmark defects,
run the live checks, and pin dependencies), then design the ISL
vocabulary and data-collection pipeline. Do not jump directly to an LLM
or claim sign translation before a real recognition model exists.

------------------------------------------------------------------------

## 7. Architecture and Data Flow

### 7.1 Current local-development flow

``` text
Browser (React)
   |
   | HTTP requests through Vite proxy
   v
FastAPI backend (127.0.0.1:8000)
   |
   v
Camera manager / OpenCV capture
   |
   v
Frame processing service
   |
   +--> MediaPipe hand detector
   |       |
   |       +--> 0, 1, or 2 hands
   |       +--> 21 landmarks per hand
   |       +--> handedness and confidence
   |
   +--> Draw annotations on frame
   |
   +--> Store latest structured detection result
   |
   v
MJPEG stream + structured API response
   |
   v
React translator UI
```

### 7.2 Future recognition flow

``` text
Camera frames
   |
OpenCV / browser capture
   |
MediaPipe landmarks
   |
Feature normalization
   |
Static classifier or temporal sequence model
   |
Supported sign label + confidence
   |
Temporal smoothing / sign segmentation
   |
Committed recognized sign sequence
   |
Constrained text formation
   |
Translated text
   |
User-triggered text-to-speech
```

### 7.3 API design guidance

Inspect the existing routes first and preserve working API contracts. Do
not create duplicate endpoints just to match this document.

Potential API surface (adapt to current implementation):

  Method   Endpoint               Purpose
  -------- ---------------------- ----------------------------------
  GET      `/api/health`          Backend health
  POST     `/api/camera/start`    Start camera
  POST     `/api/camera/stop`     Stop camera
  GET      `/api/camera/stream`   MJPEG stream
  GET      `/api/hands/latest`    Latest structured hand detection
  GET      `/api/hands/status`    Optional lightweight status

If the current frontend uses different paths, either preserve them or
provide a backwards-compatible migration. Document the final route
contract.

------------------------------------------------------------------------

## 8. UX and Accessibility Requirements

-   Keep the existing SignBridge visual identity and design system.
-   Use clear, high-contrast text and controls.
-   Ensure keyboard focus is visible.
-   Give buttons descriptive accessible names.
-   Do not rely on color alone to communicate status.
-   Use responsive layouts.
-   Show explicit camera states: idle, starting, live, stopping,
    unavailable, and error.
-   Show hand states: no hand detected, one hand detected, two hands
    detected, and processing error.
-   Do not show stale landmark values as if they are current.
-   Avoid flashing or rapidly changing status labels.
-   Provide text output as well as audio output.
-   Explain when a feature is experimental or supports only a limited
    vocabulary.
-   Avoid implying that a low-confidence result is reliable.

------------------------------------------------------------------------

## 9. Privacy, Consent, and Responsible Use

SignBridge processes camera data, which may contain identifiable
biometric information.

Required principles: - Ask for camera access only after the user chooses
to start the camera. - Explain why camera access is needed. - Provide an
obvious stop-camera control. - Release camera resources promptly. -
Process locally where practical. - Do not record or persist raw video by
default. - Do not upload frames to third-party services without explicit
disclosure and appropriate consent. - Use pseudonymous participant IDs
for dataset collection. - Obtain informed consent from dataset
participants. - Provide a way to exclude or delete a participant's
collected data where applicable. - Document dataset sources and
licenses. - Do not make claims that the system is suitable for
high-stakes communication without rigorous validation.

------------------------------------------------------------------------

## 10. Development Roadmap and Acceptance Criteria

### Phase 0 --- Repository foundation

Tasks: - Inspect and preserve existing repository. - Confirm frontend
and backend startup instructions. - Confirm environment configuration
and CORS. - Ensure README and development documentation exist. - Add
basic tests and `.gitignore`.

Acceptance: - Frontend starts. - Backend starts. - Health endpoint
returns success. - Frontend can reach backend through the configured
proxy. - No secrets or virtual environments are committed.

### Phase 1 --- OpenCV webcam integration

Tasks: - Use OpenCV to open the local camera. - Provide start/stop
controls. - Stream frames to React. - Handle device unavailable and busy
conditions. - Release camera resources correctly.

Acceptance: - Real webcam video appears. - Start/stop works
repeatedly. - No fake or prerecorded video is used. - Camera is released
after stopping.

### Phase 2 --- MediaPipe hand detection

Tasks: - Integrate MediaPipe with OpenCV frames. - Detect up to two
hands. - Extract 21 landmarks per hand. - Return normalized coordinates
and handedness. - Annotate video. - Update React status and landmark
panel. - Handle no-hand state and resource cleanup.

Acceptance checklist (status verified 2026-11-08; `[x]` = proven by
automated or hardware test, `[~]` = partly proven, `[ ]` = not yet proven):

-   [x] Camera starts and streams (API tests and real-webcam hardware test).
-   [x] No hand returns zero hands and an empty list (blank-frame test).
-   [x] One hand returns 21 landmarks (still-image test).
-   [~] Two hands return up to 42 landmarks: proven on a composite still
    image only. A live two-hand check is still needed.
-   [x] Each hand has a handedness label, and the left/right labels were
    correct in live manual testing (user report, 2026-11-08). Method: the user
    showed each hand to the camera and compared the panel label.
-   [x] Landmark points and connections are drawn (annotation test checks a
    drawn connection pixel).
-   [x] Moving the hand updates landmarks (manual check, user report 2026-11-08).
-   [x] Removing the hand clears the current result (toggle-camera test and
    `no_hand` status test). The frontend still shows stale hands after a
    poll error (defect 2 above).
-   [x] Repeated start/stop does not leak or lock the camera: five manual
    cycles worked (user report, 2026-11-08), and automated tests cover two
    cycles plus camera release. A long soak test is not run.
-   [x] Inference is not initialized for every frame (the detector is built
    once in `CameraService.start()` and reused). No test asserts this yet.
-   [x] Existing frontend and backend behavior remains functional (after the
    fix pass: backend 47 passed, frontend 32 passed, build succeeds).

**Phase 2 is closed (2026-11-08).** Automated tests, hardware tests, and the
manual checks in the user report pass. Defects 1 to 5 are fixed. Still open,
and not blocking Phase 2: a live two-hand check with a real camera (the
composite still-image test passes, but a live session has not been
reported), a long soak test, and frame-rate measurements. These are recorded for Phase 10 (testing).

Numbering note: the phase numbers in this section are authoritative.
`docs/DEVELOPMENT_PLAN.md` and the README roadmap use an older numbering
in which Phase 2 is ISL recognition. Those documents are being aligned.

### Phase 3 --- ISL scope and dataset design

**Status (2026-11-08): in progress.** Phase 3 is open. Its acceptance criteria
are not met, because no samples have been recorded and no signer has confirmed
the handshapes.

Update 2026-11-08: the official ISLRTC chart "English Alphabets in Indian Sign
Language" was downloaded and read (source id `ISLRTC-ALPHABET`). Six one-handed
static letters are marked verified in `vocabulary.json`: C, L, O, S, U, V. Each
has `signer_confirmed: false` until a Deaf ISL signer or qualified ISL
interpreter confirms it. Letters with two-hand or moving shapes are excluded
until their hand counts are confirmed. "A" is not in the pilot set, because the
hand count on the chart could not be confirmed.

Done:
-   Protocol: `ai-engine/dataset/README.md` (consent, pseudonyms, recording,
    storage, split rules).
-   Source register and gated vocabulary: `ai-engine/dataset/metadata/vocabulary.json`.
    It has zero verified classes.
-   Reviewer worksheet, consent form draft, and offline participant register
    template: `ai-engine/dataset/templates/`.
-   Recording tool with consent, pseudonym, and verified-label gates:
    `ai-engine/collection/collect_static.py`.
-   Dataset report, reproducible participant-level split, and coverage/leakage
    checks: `ai-engine/collection/dataset_stats.py`.
-   Tests: `ai-engine/tests/` (30 passing). Most use synthetic data. Three run
    the real MediaPipe detector on fixture photos through the recording tool's
    frame path (one hand accepted, two hands and blank frames rejected for a
    one-hand class).
-   The recording tool was checked with `--help` (exit 0). It has not been run
    with a camera, because no participant has consented to recording yet.

Blocked on people and access (this environment cannot do these):
-   Official ISLRTC references could not be read. The poster page returns 404,
    and the dictionary is video, which cannot be watched here. No class can be
    verified until a qualified reviewer checks the videos or poster.
-   Ethics approval and signed consent from signers. The consent form is a draft.
-   Recording sessions. No samples exist, so no class counts or split results
    are real yet.

Tasks: - Research and define a small, verified ISL vocabulary. -
Distinguish static signs from dynamic signs. - Document sources and
labeling rules. - Build a collection tool. - Collect consented samples
from multiple signers where possible. - Inspect balance and data
quality. - Split data by signer.

Acceptance: - Vocabulary and references are documented. - Each class has
a clear label and definition. - Dataset has documented counts and
limitations. - Training, validation, and test data are separated without
participant leakage.

### Phase 4 --- Static sign classification

**Status (2026-11-08): pipeline built and tested; no model trained yet.**
Built:
-   Feature normalization shared by training and live use:
    `backend/app/services/landmark_features.py` (63 values, wrist-relative,
    scaled by hand size). Tests in `backend/tests/test_landmark_features.py`.
-   Dataset preparation: `ai-engine/training/prepare_dataset.py`.
-   Training and evaluation with a participant-level split:
    `ai-engine/training/train_static_classifier.py` (RandomForest, 300 trees).
    It refuses to run when a split is empty or a class has too few
    participants. It writes the model and a metrics report to
    `ai-engine/models/`.
-   Live recognition: `backend/app/services/recognition_service.py`, served at
    `GET /api/recognition/latest`. It returns a letter only when the
    probability reaches `SIGNBRIDGE_RECOGNITION_THRESHOLD` (default 0.7). It
    returns "no model" when no model file exists.
-   Frontend panel "Letter recognition (pilot)" on `/translator`.
-   Tests: backend 57 passing (including 5 recognition tests on a synthetic
    model), AI engine 27 passing, frontend 38 passing.

Not done (needs data): training on real recordings, held-out evaluation, and
the confusion matrix and per-class report. The live panel shows "no model
loaded" until a model is trained.

Tasks: - Build feature extraction and normalization. - Train a baseline
model. - Evaluate per-class performance. - Add confidence threshold and
unknown class behavior. - Integrate prediction into backend.

Acceptance: - Model is trained from real labeled data. - Evaluation uses
held-out participants where possible. - Metrics and confusion matrix are
documented. - Unsupported/uncertain signs are not confidently
mislabeled. - Live prediction is demonstrably based on model inference.

### Phase 5 --- Text output and temporal stabilization

**Status (2026-11-08): complete in code and automated tests.** Implemented in
`frontend/src/lib/signBuffer.js` (hold rule, no repeats while held, reset on
uncertain or missing results, undo, clear, space) with the hook
`useSignBuffer.js` and the panel `TranslationOutputPanel.jsx`. Each committed
item keeps its confidence. Tests: `signBuffer.test.js`, `useSignBuffer.test.jsx`,
`TranslationOutputPanel.test.jsx`. Live check still needs a trained model (Phase
4), because the buffer has nothing to commit until a letter is recognized.

Tasks: - Add prediction smoothing/debouncing. - Prevent repeated word
insertion for a held gesture. - Add clear/undo controls. - Display
committed text. - Preserve confidence and uncertainty information.

Acceptance: - Stable signs are not appended repeatedly every frame. -
User can correct output. - Low-confidence predictions are handled
safely.

### Phase 6 --- Text-to-speech

**Status (2026-11-08): complete in code and automated tests; audible check
pending.** Implemented in `frontend/src/lib/speech.js` with Speak, Pause or
Resume, and Stop in `TranslationOutputPanel.jsx`. Only the committed text is
spoken, and only when the user presses Speak. Unsupported browsers and
missing voices are reported. Tests: `speech.test.js` and the panel test, which
checks that the spoken text equals the visible text.

Tasks: - Integrate browser SpeechSynthesis. - Add play/cancel
controls. - Speak committed text only. - Handle unavailable voices.

Acceptance: - Visible translated text matches spoken text. - Speech does
not trigger repeatedly from raw frame predictions.

### Phase 7 --- Dynamic sign recognition and non-manual features

**Status (2026-11-08): blocked, not started.** Dynamic signs need recorded
landmark sequences from several participants, and none exist. No sequence
model has been built. Non-manual features also need consented data, and the
plan forbids treating them as generic emotion detection.

Tasks: - Collect temporal landmark sequences. - Define sign boundaries
and sequence labels. - Evaluate temporal model architectures. -
Investigate facial/head/body signals using appropriate data and
consent. - Combine features only when supported by evidence.

Acceptance: - Sequence model is evaluated on unseen signers. - Dynamic
signs are clearly distinguished from static signs. - Non-manual features
are not treated as generic emotion detection. - Limitations are
documented.

### Phase 8 --- NLP / optional LLM assistance

**Status (2026-11-08): deterministic stage complete; LLM deliberately not added.**
Sentence text is the committed letters plus user-added spaces, with no
language model involved (`toText` in `signBuffer.js`). Every item keeps its
label and confidence and can be undone, so raw recognized labels stay visible
and recoverable. An LLM is not added, because the plan requires reliable
recognition first and no recognized data exists yet.

Tasks: - Start with deterministic sentence assembly. - Explore
constrained post-processing only if needed. - Keep original recognized
labels visible or recoverable. - Handle uncertainty without guessing.

Acceptance: - Post-processing does not invent signs. - Users can inspect
and correct recognized content. - Raw model output and processed text
are distinguishable.

### Phase 9 --- Learning module and persistence

**Status (2026-11-08): partly done.** Done: finger-spelling cards for the six
pilot letters (C, L, O, S, U, V) that link to the official ISLRTC chart, with
local practice progress and a reset control (`AlphabetCards.jsx`,
`usePracticeProgress.js`). Progress stays in the browser and is never sent to a
server. Not done: practice mode and quizzes, which need a trained recognizer
(Phase 4); the lesson browser for word-level content, which needs sourced
references; and any database, which the plan defers.

Tasks: - Build verified ISL sign cards and practice flows. - Add quizzes
and feedback. - Add local progress first. - Introduce MongoDB only when
persistence is needed.

Acceptance: - Learning content is accurate and sourced. - Progress is
saved only with appropriate privacy controls. - No database secrets are
exposed to the browser.

### Phase 10 --- Testing, deployment, and final documentation

**Status (2026-11-08): partly done.** Done: the test plan and results in
`docs/TEST_PLAN.md` (automated results, measured detection latency of about 30 ms
per frame, manual checklist, browser support, and the local-first deployment
decision). Not done: a final demo, the report, and the presentation, which
need the results of Phases 4 and 7. Manual rows marked "Not run" are still
open.

Tasks: - Add unit, integration, and manual test plans. - Measure latency
and model performance. - Document supported devices/browsers. - Decide
local vs remote camera architecture. - Deploy only after environment and
privacy requirements are understood. - Prepare demo, report, and
presentation.

Acceptance: - Setup is reproducible from a clean checkout. - Tests and
limitations are documented honestly. - Deployment architecture matches
the camera-access model. - No unsupported claims are made in the final
demo or report.

------------------------------------------------------------------------

## 11. Testing Strategy

Use multiple levels of testing.

### Backend unit tests

-   Health endpoint.
-   Landmark payload schema.
-   No-hand result structure.
-   One-hand and two-hand result structure using controlled test inputs
    where feasible.
-   Camera manager state transitions.
-   Resource cleanup.
-   Error handling.

### Integration tests

-   API start/stop behavior.
-   MJPEG response content type and frame boundaries.
-   Latest-landmark endpoint consistency.
-   Frontend proxy to backend.
-   Camera and inference service coordination.

### Manual hardware tests

-   Camera available.
-   Camera busy in another application.
-   Camera disconnected.
-   No hand.
-   One left hand.
-   One right hand.
-   Two hands.
-   Hands moving in and out of frame.
-   Poor and bright lighting.
-   Repeated start/stop.
-   Browser refresh while camera is active.

### Model evaluation

For sign recognition, report: - Dataset size and class distribution. -
Train/validation/test split method. - Participant-level split. -
Accuracy. - Precision, recall, and F1-score per class. - Confusion
matrix. - Inference latency. - Known failure cases.

Do not write tests that merely assert hardcoded fake detections. Where
real camera hardware is unavailable in CI, mock the camera boundary for
service tests and separately document the manual hardware test that
remains necessary.

------------------------------------------------------------------------

## 12. Repository and Code Quality Rules for OpenCode

These rules are mandatory for every implementation task.

1.  **Read before writing.** Inspect the existing code, package files,
    routes, services, and README before editing.
2.  **Preserve working behavior.** Do not rewrite or replace functional
    webcam streaming without a demonstrated need.
3.  **Make focused changes.** Implement one phase or feature at a time.
4.  **No fake functionality.** Never simulate AI, camera frames,
    landmarks, or predictions while presenting them as real.
5.  **No silent architecture changes.** Explain and document any stack
    or API changes.
6.  **Use modular code.** Separate routes, services, schemas, UI
    components, and model code.
7.  **Validate dependencies.** Check Python and package compatibility
    before changing requirements.
8.  **Protect resources.** Manage camera handles, threads, model
    instances, and locks carefully.
9.  **Handle errors.** Provide actionable errors in logs and safe
    messages in the UI.
10. **Test changes.** Run relevant tests and builds after
    implementation.
11. **Report honestly.** Distinguish tests passed, tests failed, and
    tests not run.
12. **Update docs.** Keep README, API docs, and this plan synchronized.
13. **Avoid unnecessary complexity.** Do not add MongoDB,
    authentication, LLM calls, or deployment systems prematurely.
14. **Keep secrets private.** Use environment variables and
    `.env.example`; never commit real `.env` files.
15. **Do not overwrite user data.** Preserve collected datasets, user
    assets, and existing configuration.
16. **Use maintainable dependencies.** Avoid adding packages for
    functionality already available in the stack.

### Required OpenCode completion report

After every phase, report: - Summary of implementation. - Files created,
changed, and removed. - Dependency changes and reasons. - Commands to
run the application. - Tests actually executed and their results. -
Manual tests still required. - Known limitations and unresolved
issues. - Whether the phase acceptance criteria are met. - Recommended
next task.

Do not proceed automatically to the next phase unless explicitly asked.

------------------------------------------------------------------------

## 13. Local Development Guidance

The project is being developed on Windows 11. Use Windows-compatible
commands in documentation and provide PowerShell alternatives where
useful.

Verified backend startup (2026-11-08). The venv folder is `.venv`, which is
the name the README and `.gitignore` use:

``` powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python scripts/download_models.py        # only if backend\models\hand_landmarker.task is missing
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verified frontend startup:

``` powershell
cd frontend
npm ci
npm run dev
```

Not yet run end to end on this machine: the `uvicorn` and `npm run dev`
commands above, and the activation script. The tests were run through
`.\.venv\Scripts\python.exe -m pytest`. The `download_models.py` step was
skipped because the model file already exists.

Verified test commands:

``` powershell
cd backend
python -m pytest                                  # 31 passed, 3 skipped
$env:SIGNBRIDGE_RUN_CAMERA_TESTS = "1"
python -m pytest -m hardware -v                   # 3 passed, uses the real webcam

cd ..\frontend
npm test                                          # 27 passed
npm run build                                     # succeeds
```

If the activation script is blocked, run
`.\.venv\Scripts\python.exe -m uvicorn ...` directly.

If PowerShell blocks activation, document a safe alternative such as
running the environment's Python executable directly:

``` powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Do not assume the exact commands are correct until the repository has
been inspected. Update this section with the commands that actually
work.

Useful local checks: - Frontend Vite URL (commonly
`http://localhost:5173`). - Backend health endpoint (commonly
`http://127.0.0.1:8000/api/health`). - FastAPI docs (commonly
`http://127.0.0.1:8000/docs`).

If Vite reports `ECONNREFUSED 127.0.0.1:8000`, first verify that the
FastAPI process is running on the configured host and port. Then verify
the Vite proxy target. Do not treat a running frontend as proof that the
backend is running.

------------------------------------------------------------------------

## 14. Definition of Done for the Overall Project

The project can be considered a successful academic prototype when:

-   The frontend and backend run from documented instructions.
-   Webcam capture works reliably in the supported local setup.
-   MediaPipe detects and tracks up to two hands with 21 landmarks each.
-   The system has a real, documented, limited ISL dataset.
-   A trained recognition model predicts the supported vocabulary.
-   Recognition is evaluated with meaningful held-out data and
    transparent metrics.
-   The interface shows uncertainty and does not claim unsupported
    signs.
-   Recognized content can be displayed as text.
-   Text-to-speech reads committed text.
-   The learning module provides accurate, sourced content for the
    supported signs.
-   Tests, limitations, privacy practices, and setup instructions are
    documented.
-   The final presentation clearly explains what is implemented versus
    planned.

A system that only displays webcam video and hand landmarks is a valid
computer-vision milestone, but it is **not yet a sign-language
translator**. The final project must preserve this distinction.

------------------------------------------------------------------------

## 15. Immediate Next Actions

OpenCode should perform the following next, in order:

1.  Read this `PLAN.md` and inspect the complete existing repository.
2.  Summarize the actual current implementation and compare it with
    Section 6.
3.  Identify any Phase 2 acceptance criteria that have not been proven.
4.  Run existing backend tests and frontend build without making
    unnecessary changes.
5.  Add or fix focused tests for landmark payloads, no-hand behavior,
    one-hand/two-hand structure, and resource lifecycle.
6.  Provide a manual test checklist for real webcam validation.
7.  Update this plan with verified results and actual commands.
8.  Stop and report. Do not start ISL dataset/model training until the
    user approves the next phase.

------------------------------------------------------------------------

## 16. Instruction to OpenCode

Treat this file as the project's master context and technical direction.
Do not interpret it as permission to implement every future feature
immediately.

At the start of each task: - Read this file. - Inspect the repository. -
Identify the requested milestone. - Make only the changes needed for
that milestone. - Preserve existing working functionality. - Validate
the result. - Update the project documentation and status. - Report what
is genuinely complete.

**Guiding principle:** Build a real, testable, accessible ISL
communication prototype incrementally. Accuracy, transparency, user
consent, and maintainability are more important than claiming a large
feature set.
