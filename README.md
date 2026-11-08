# SignBridge

**Breaking Barriers. Connecting People.**

SignBridge is an AI-powered accessibility platform for real-time communication between sign-language users and people who do not know sign language. It is an academic capstone project focused on Indian Sign Language (ISL).

> **Current status:** the landing page, routing, backend API, OpenCV webcam pipeline, and MediaPipe hand landmark detection are implemented and tested. Sign classification (what the hand means), translation, text-to-speech, lessons, and progress tracking are **not implemented yet** and are shown as "under development" in the UI. No recognition output is simulated.

---

## Table of contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Folder structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Frontend setup](#frontend-setup)
- [Backend setup](#backend-setup)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Testing](#testing)
- [Webcam troubleshooting](#webcam-troubleshooting)
- [Current implementation status](#current-implementation-status)
- [Roadmap](#roadmap)

---

## Features

| Area | Status |
| --- | --- |
| Landing page (hero, features, how it works, about, footer) | Implemented |
| Responsive navigation with mobile menu | Implemented |
| Routes `/`, `/translator`, `/learn`, and a 404 page | Implemented |
| FastAPI backend with health endpoint, CORS, and structured errors | Implemented |
| OpenCV webcam capture with MJPEG streaming | Implemented |
| Start / Stop camera controls with status and error messages | Implemented |
| MediaPipe hand landmark detection (up to 2 hands, 21 landmarks each) | Implemented |
| Annotated live feed with landmark connections | Implemented |
| Hand detection status, hand count, and landmark coordinate panel | Implemented |
| Backend connection indicator | Implemented |
| Sign classification from landmarks (ISL gestures) | Planned |
| Indian Sign Language classification (TensorFlow) | Planned |
| Sign-to-text translation | Planned |
| Text-to-speech | Planned |
| Interactive learning and progress tracking (MongoDB) | Planned |

## Technology stack

**Frontend:** React 19, Vite, JavaScript, Tailwind CSS 4, React Router, Lucide React icons. Tests use Vitest and React Testing Library.

**Backend:** Python 3.11+ (developed on 3.13), FastAPI, Uvicorn, Pydantic and pydantic-settings, OpenCV (`opencv-contrib-python`, which MediaPipe depends on), NumPy, MediaPipe 1.2 (Tasks API `HandLandmarker`). Tests use pytest and httpx.

**Planned:** TensorFlow (ISL classifier), MongoDB (users and progress).

## Folder structure

```
SignBridge/
├── frontend/                 React + Vite application
│   ├── public/               Static assets (favicon)
│   ├── src/
│   │   ├── components/       Reusable UI
│   │   │   ├── camera/       Camera panel, preview, controls
│   │   │   ├── common/       Logo, badges, headings, page wrappers
│   │   │   ├── landing/      Hero, features, how it works, about
│   │   │   ├── layout/       Navbar, footer
│   │   │   ├── learn/        Lesson cards (placeholder)
│   │   │   └── translator/   Output and roadmap panels (placeholder)
│   │   ├── data/             Static content for landing and module pages
│   │   ├── hooks/            useCamera, useBackendHealth
│   │   ├── layouts/          MainLayout (navbar + outlet + footer)
│   │   ├── pages/            Landing, Translator, Learn, NotFound
│   │   ├── services/         API client and endpoint wrappers
│   │   ├── test/             Vitest setup and helpers
│   │   ├── assets/           Images and icons
│   │   ├── App.jsx           Route definitions
│   │   └── main.jsx          Entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── api/              Routers: health, camera (incl. landmarks); dependencies
│   │   ├── core/             Settings (env config) and error types
│   │   ├── schemas/          Pydantic request/response models
│   │   ├── services/         CameraService (OpenCV) and HandDetector (MediaPipe)
│   │   └── main.py           App factory, CORS, error handlers
│   ├── models/               MediaPipe model files (hand_landmarker.task)
│   ├── scripts/              download_models.py
│   ├── tests/                Unit, API, hardware tests, and image fixtures
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── pytest.ini
│   └── .env.example
│
├── ai-engine/
│   ├── dataset/              ISL samples (not committed)
│   ├── training/             Training and evaluation scripts
│   ├── models/               Exported models (not committed)
│   └── README.md
│
├── docs/
│   └── DEVELOPMENT_PLAN.md   Phased development plan
│
├── .gitignore
└── README.md
```

## Prerequisites

- **Node.js** 20.19 or newer (22 LTS recommended) and npm.
- **Python** 3.11 or newer (3.13 tested).
- **A webcam** for the camera features. The rest of the app works without one.
- **Windows:** camera access for desktop apps must be allowed (see [Webcam troubleshooting](#webcam-troubleshooting)).

## Quick start

Run the backend and the frontend in two terminals.

```powershell
# Terminal 1: backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2: frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to the backend on port 8000.

## Frontend setup

```powershell
cd frontend
npm install           # install dependencies
npm run dev           # start the dev server at http://localhost:5173
npm test              # run the Vitest suite once
npm run build         # production build into frontend/dist
npm run preview       # serve the production build locally
```

Optional: copy `frontend/.env.example` to `frontend/.env.local` to change the API base URL (default `/api`). Only `VITE_`-prefixed values are exposed to the browser, so never place secrets there.

## Backend setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt   # runtime + test dependencies
```

Start the API:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive API docs are available at **http://127.0.0.1:8000/docs** while the server runs.

Run the tests:

```powershell
python -m pytest
```

## Configuration

Settings are read from environment variables prefixed with `SIGNBRIDGE_`, or from `backend/.env`. Copy `backend/.env.example` to `backend/.env` to start.

| Variable | Default | Description |
| --- | --- | --- |
| `SIGNBRIDGE_ENVIRONMENT` | `development` | Environment name shown by the health endpoint |
| `SIGNBRIDGE_LOG_LEVEL` | `INFO` | Python logging level |
| `SIGNBRIDGE_CORS_ORIGINS` | `["http://localhost:5173","http://127.0.0.1:5173"]` | JSON list of allowed browser origins |
| `SIGNBRIDGE_CAMERA_INDEX` | `0` | Which webcam OpenCV opens (`1`, `2`, … for additional cameras) |
| `SIGNBRIDGE_CAMERA_WIDTH` / `_HEIGHT` | `640` / `480` | Requested capture resolution |
| `SIGNBRIDGE_CAMERA_FPS` | `30` | Target stream frame rate |
| `SIGNBRIDGE_CAMERA_JPEG_QUALITY` | `80` | JPEG quality for streamed frames (1–100) |
| `SIGNBRIDGE_CAMERA_MAX_READ_FAILURES` | `30` | Consecutive failed reads before the camera is marked as stopped |
| `SIGNBRIDGE_HAND_DETECTION_ENABLED` | `true` | Turn MediaPipe hand detection on or off |
| `SIGNBRIDGE_HAND_MAX_HANDS` | `2` | Maximum hands detected per frame |
| `SIGNBRIDGE_HAND_MIN_DETECTION_CONFIDENCE` | `0.5` | Minimum score to accept a new hand detection (0–1) |
| `SIGNBRIDGE_HAND_MIN_PRESENCE_CONFIDENCE` | `0.5` | Minimum score to keep reporting a hand (0–1) |
| `SIGNBRIDGE_HAND_MIN_TRACKING_CONFIDENCE` | `0.5` | Minimum tracking score between frames (0–1) |

## API reference

Base URL: `http://127.0.0.1:8000/api`. Errors use one JSON shape:

```json
{ "error": { "code": "camera_unavailable", "message": "The webcam could not be opened. …" } }
```

| Method | Path | Description | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/health` | Liveness check | `200` `{status, service, version, environment, timestamp}` | — |
| GET | `/camera/status` | Camera state and last error | `200` `{running, camera_index, width, height, fps, last_error}` | — |
| POST | `/camera/start` | Open the webcam and start capturing (idempotent) | `200` status object | `503 camera_unavailable` |
| POST | `/camera/stop` | Stop capturing and release the webcam | `200` status object | — |
| GET | `/camera/landmarks` | Latest hand landmarks, matched to the most recent annotated frame | `200` `{status, running, detection_available, detection_error, frame_sequence, hand_count, hands, timestamp}` | — |
| GET | `/camera/stream` | MJPEG stream of annotated frames (`multipart/x-mixed-replace; boundary=frame`) | `200` stream of JPEG frames | `409 camera_not_running` |

`status` is one of `camera_off`, `detection_unavailable` (the hand model did not load), `processing_error` (the latest frame could not be processed; `hands` is empty), `no_hand`, or `hand_detected`. Each hand has `handedness` (`Left`/`Right`), `score`, and 21 `landmarks` with `index`, `name`, and normalized `x`, `y` (0–1 across the frame, origin top-left) and `z` (depth relative to the wrist).

Example landmark response with one hand (abbreviated):

```json
{
  "status": "hand_detected",
  "running": true,
  "detection_available": true,
  "detection_error": null,
  "frame_sequence": 412,
  "hand_count": 1,
  "hands": [
    {
      "handedness": "Right",
      "score": 0.97,
      "landmarks": [
        { "index": 0, "name": "WRIST", "x": 0.42, "y": 0.81, "z": 0.0 },
        { "index": 1, "name": "THUMB_CMC", "x": 0.39, "y": 0.74, "z": -0.02 }
      ]
    }
  ],
  "timestamp": "2026-11-08T10:15:02.114Z"
}
```

Example:

```powershell
curl http://127.0.0.1:8000/api/health
curl -X POST http://127.0.0.1:8000/api/camera/start
curl http://127.0.0.1:8000/api/camera/stream --output sample.mjpeg   # Ctrl+C to stop
curl -X POST http://127.0.0.1:8000/api/camera/stop
```

**Design notes**

- One background thread owns the OpenCV capture handle. Every viewer reads the latest frame, so the camera is never opened twice.
- The stream ends when the camera is stopped, when it fails, or when the client disconnects.
- The FastAPI lifespan hook releases the webcam when the server shuts down.

## Hand landmark detection (MediaPipe)

Hand detection runs on the same OpenCV frames as the camera preview. The backend runs the MediaPipe Hands model on every frame it processes and draws the 21 landmarks and their connections onto the image before streaming it.

### How it works

- **Model:** MediaPipe Tasks `HandLandmarker` with the `hand_landmarker.task` model (Google, Apache 2.0). The file is stored in `backend/models/`, and `python scripts/download_models.py` restores it if missing.
- **Single load:** the detector is created when the camera first starts and reused for every frame and every later start. It is closed on server shutdown.
- **Color:** OpenCV delivers BGR frames. They are converted to RGB before inference.
- **Threads:** a capture thread reads frames at the camera rate. A separate processing thread always works on the newest frame, so slow inference skips frames instead of building a backlog. The FastAPI event loop is never blocked.
- **Drawing:** `mediapipe.tasks.python.vision.drawing_utils` draws landmarks and `HAND_CONNECTIONS` onto a copy of the frame.
- **Consistency:** the streamed JPEG and the landmark snapshot are published together under one lock, so they come from the same processed frame. The MJPEG stream does not carry `frame_sequence`, so a client cannot check the match directly.

### Installation requirements

- Python 3.11+ with the packages in `backend/requirements.txt`. MediaPipe installs `opencv-contrib-python` as a dependency, so `opencv-python` must not be installed alongside it. Installing both causes a conflict over the `cv2` module.
- The model file in `backend/models/hand_landmarker.task` (about 7.8 MB). It is committed to the repository. To fetch it again:

```powershell
cd backend
python scripts/download_models.py
```

### How to run hand detection

1. Start the backend and frontend as in [Quick start](#quick-start).
2. Open http://localhost:5173/translator and click **Start Camera**.
3. Show one or both hands to the camera, palm or back facing it, with good light and the hand fully in view.
4. The status badge changes to **Hand detected** and shows the hand count. The landmark panel lists each hand's 21 landmarks with coordinates. The preview shows the drawn skeleton.
5. Lower your hand out of view. The status changes back to **No hand detected** and the coordinates disappear.

The backend can also be checked without the browser:

```powershell
curl -X POST http://127.0.0.1:8000/api/camera/start
curl http://127.0.0.1:8000/api/camera/landmarks
curl -X POST http://127.0.0.1:8000/api/camera/stop
```

### Known limitations

- **Lighting and background matter.** In testing with the real webcam, a hand that appeared as a dark silhouette against strongly blue, dim light was not detected, even after brightness and contrast adjustments. Use a well-lit scene with a plain background.
- **Partial hands are often missed.** Fingers cut off by the frame edge can prevent detection.
- **Hands are reported without gesture meaning.** The 21 landmarks are geometry only. Mapping them to Indian Sign Language signs is the next phase, and no word or sign is produced yet.
- **Coordinates are for the unmirrored image.** The preview is mirrored in CSS for a natural selfie view, but landmark X values refer to the original camera image.
- **Two-hand accuracy depends on tracking.** The detector runs in VIDEO mode, which tracks hands between frames to save computation, so a second hand that enters mid-stream can take a few frames to appear.
- **CPU only.** Inference runs on the CPU. Frame rate on your machine depends on hardware and is not benchmarked in this release.
- **Handedness is not yet validated.** Labels are reported, but the left/right answer has not been checked on a live camera with a known hand. Tests on two fixture photos gave inconsistent results when mirrored.
- **Errors never show old hands.** When a frame fails to process, the status is `processing_error` and no hands are reported. When a landmark request fails in the browser, the coordinate panel hides its data until the backend responds.

## Testing

```powershell
# Backend unit and API tests (no webcam needed)
cd backend
python -m pytest

# Backend hardware tests (uses the real webcam, opens a local Uvicorn server)
$env:SIGNBRIDGE_RUN_CAMERA_TESTS = "1"
python -m pytest -m hardware -v -s

# Frontend tests
cd frontend
npm test
```

| Suite | Count | What it covers |
| --- | --- | --- |
| Backend unit/API (`tests/test_*.py`, excluding hardware) | 47 | Health, CORS, error shapes, camera lifecycle, MJPEG framing, 503/409 handling, release on stop, single-instance start; MediaPipe detection on real images (no hand, one hand = 21 landmarks, two hands = 42, connections drawn, source frame unchanged); landmarks API with a hand appearing and then removed; detector load failure reported without breaking the camera |
| Backend hardware (`tests/test_camera_hardware.py`) | 3 | Real webcam: start, receive JPEG frames over HTTP, stop, reopen, and read the landmarks endpoint |
| Frontend (`src/**/*.test.*`) | 32 | Routes and page content, API error mapping, camera hook states, landmark polling, landmark panel (no coordinates without a hand, 21 rows per hand, two tables for two hands), status badges |

The hand detection tests use real MediaPipe inference on fixture photos in `backend/tests/fixtures/` (see the README there for sources and licenses). The "hand removed" test uses a test camera that switches between a hand image and a blank frame, so the real detector runs on both states. Test results are reported from actual runs; tests that need the model or fixtures are skipped with a message if they are missing.

Hardware tests are skipped unless `SIGNBRIDGE_RUN_CAMERA_TESTS=1` is set, so CI and machines without a camera still pass.

## Webcam troubleshooting

The backend opens the camera with OpenCV (DirectShow on Windows). If it cannot open the device, the UI shows the reason returned by the API.

- **"could not be opened"**: another app is using the camera, the camera is disabled in Device Manager, or Windows blocks it. Close video apps and check **Settings → Privacy & security → Camera**. Make sure **Camera access** and **Let desktop apps access your camera** are on.
- **"opened but did not deliver any frames"**: the driver accepted the request but returned no frames. Unplug and replug USB cameras, or restart.
- **"stopped delivering frames"**: the camera was disconnected or taken over during streaming.
- **Live preview is a flat gray image with a lock icon**: this is what Windows delivers instead of camera video when the camera is blocked at the OS or hardware level (for example a privacy shutter). The software path is working, but the device is not providing a picture. Check whether the **Windows Camera** app shows real video. If it shows the same placeholder, fix the camera privacy setting or shutter. If it shows real video, report the issue.
- **Browser cannot reach the backend**: start the backend on port 8000 and keep the Vite dev server running. The UI shows "Backend unreachable" with a Retry button.

The browser never accesses the webcam directly; only the backend does. Browser permission prompts therefore do not appear for this feature.

## Current implementation status

**Implemented**

- Project scaffold for frontend, backend, AI engine, and documentation.
- Landing page with hero, features, how it works, about, and footer. Responsive down to 390px wide, verified in a browser.
- Routes: `/`, `/translator`, `/learn`, and a 404 page.
- Backend: `GET /api/health`, environment-based settings, CORS for the Vite dev server, structured errors, and a camera service with MJPEG streaming.
- Frontend camera panel: Start and Stop, status badges, connecting and error states, live preview, and automatic status checks while live.
- MediaPipe hand landmark detection on live OpenCV frames: up to two hands, 21 landmarks each, drawn on the stream, with a hand count, status badge, and coordinate panel.
- Verified on 2026-11-08: frontend build and 32 frontend tests; 47 backend tests; 3 hardware tests on the real webcam; and a browser run in Chrome that started the camera, saw decoded frames, showed the hand status, and confirmed the camera was released (earlier run).

**Not implemented (by design in this phase)**

- Sign classification (mapping landmarks to ISL signs), translation, and text-to-speech.
- Database, user accounts, and progress tracking.

**Known limitations**

- Recognition is not active, so the translator shows no translations.
- Hand detection can miss hands in dim, colored, or silhouetted lighting, and partial hands at the frame edge. See [Known limitations](#known-limitations) under hand detection.
- Camera frames are streamed to the browser unencrypted over local HTTP. Keep the backend on localhost or behind HTTPS before deploying.
- The stream uses one shared camera for all viewers. The backend supports one camera at a time.
- Port note (Windows): if another dev server is bound to `0.0.0.0:5173`, `http://localhost:5173` opens that server instead of SignBridge. Stop the other server, or run SignBridge on another port with `npm run dev -- --port 5174`. The Vite proxy keeps API calls working on any port.

## Roadmap

See [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) for the full plan. In short:

Phase numbers follow `PLAN.md`, which is the master plan.

1. **Phases 0 and 1, foundation and webcam (done):** React and FastAPI scaffold, OpenCV capture, and MJPEG streaming. Tests pass.
2. **Phase 2, MediaPipe hand detection (implemented, not yet closed):** automated and hardware tests pass. Still open: live handedness and two-hand checks, a start/stop soak test, and the stale-landmark fixes listed under known limitations.
3. **Phase 3, ISL scope and dataset design (started, not complete):** protocol, gated vocabulary, recording tool, and split tooling exist. A reviewer must verify the vocabulary, consent must be collected, and samples must be recorded. See `ai-engine/dataset/README.md`.
4. **Phase 4, static sign classification:** feature normalization, a baseline classifier, and held-out evaluation.
5. **Phase 5, text output and stabilization:** smoothing, clear and undo, and confidence handling.
6. **Phase 6, text-to-speech:** browser SpeechSynthesis for committed text only.
7. **Phases 7 to 10:** dynamic signs, NLP, learning and persistence, and final testing and deployment.

The `docs/DEVELOPMENT_PLAN.md` file uses an older numbering. `PLAN.md` takes precedence.

TensorFlow will go in a separate `backend/requirements-ai.txt` when the recognition phase starts, so the base install stays small.
