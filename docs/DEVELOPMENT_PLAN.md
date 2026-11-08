# SignBridge Development Plan

This plan describes the phases of the SignBridge capstone. Each phase ends with a working, testable increment.
Status markers: **Done**, **In progress**, **Planned**.

> **Note:** The master plan is [`PLAN.md`](../PLAN.md) in the project root, and its phase numbers differ from this file. In `PLAN.md`, Phase 1 is webcam capture, Phase 2 is MediaPipe hand detection, Phase 3 is ISL scope and dataset design, and Phase 4 is static sign classification. So "Phase 1: Hand Detection" below is `PLAN.md` Phase 2, and "Phase 2: ISL Gesture Recognition" covers `PLAN.md` Phases 3 and 4. As of 2026-11-08, `PLAN.md` Phase 2 is implemented but not closed. See the verification log in `PLAN.md`, Section 6.

## Phase 0: Foundation (Done)

- Project structure for frontend, backend, AI engine, and docs.
- React + Vite + Tailwind frontend with the landing page, `/translator`, and `/learn` routes.
- FastAPI backend with `GET /api/health`, environment-based settings, CORS, and structured error responses.
- OpenCV webcam service with a single shared capture device and MJPEG streaming (`GET /api/camera/stream`).
- Automated tests for frontend and backend, plus an opt-in hardware test suite.

## Phase 1: Hand Detection (Done)

- MediaPipe Hands (Tasks API) in `backend/app/services/hand_detection_service.py`, fed by the camera pipeline.
- Annotated frames on the MJPEG stream; landmark JSON at `GET /api/camera/landmarks`.
- Processing runs on its own thread and always uses the newest frame, so the camera and API stay responsive.
- Tests use real inference on fixture photos (no hand, one hand, two hands, connections drawn, hand removed).

## Phase 2: ISL Gesture Recognition

- Define the initial ISL vocabulary (finger-spelling alphabet, then common words).
- Record a dataset with labels in `ai-engine/dataset/`, with a documented collection protocol.
- Train a TensorFlow/Keras classifier on normalized landmark features in `ai-engine/training/`.
- Evaluate with held-out participants, not random frames, to avoid optimistic accuracy.
- Expose `POST /api/recognition/predict` and a WebSocket or polling endpoint for live predictions.
- Show predictions with confidence only when they exceed a validated threshold.

## Phase 3: Sign-to-Text and Text-to-Speech

- Build the translation view: confirmed signs are appended to a text buffer, with undo and clear.
- Add text-to-speech in the browser with the Web Speech API (no secrets, no paid API required).
- Add accessibility options: font size, high contrast, and keyboard-only operation.

## Phase 4: Interactive Learning

- Lesson model: categories, lessons, and sign items with reference media.
- Practice mode that uses the recognizer to score a learner's attempt.
- Replace the placeholder `/learn` page with the lesson browser.

## Phase 5: Users and Progress Tracking

- MongoDB integration (for example with Motor or PyMongo) behind a repository layer in `backend/app/services`.
- User registration and authentication (JWT with hashed passwords). Secrets stay in `backend/.env`.
- Store lesson completion, practice scores, and recognition history per user.
- Progress dashboard on `/learn`.

## Phase 6: Continuous Recognition

- Move from isolated signs to continuous sign sequences, using temporal models (for example a sequence model over landmark windows).
- Sentence-level output with segmentation and a smoothing step to avoid flickering predictions.

## Phase 7: Hardening and Release

- Performance profiling on typical student laptops; target latency and frame-rate budgets documented.
- Security review: CORS allow-list, rate limits, input validation, dependency audit.
- Deployment guide (containerized backend, static frontend hosting) and a user manual.
- Usability testing with Deaf and hard-of-hearing participants, with results recorded in `docs/`.

## Cross-cutting practices

- Every feature ships with tests. Hardware-dependent tests stay opt-in.
- No fabricated model output. UI states must reflect what is actually implemented.
- Keep ML dependencies optional until the phase that needs them.
