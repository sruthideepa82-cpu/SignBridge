# SignBridge test plan and results

Status date: 2026-11-08. Machine: Windows 11, AMD CPU, Python 3.13.5, Node 22.17.0, Chrome (for the earlier browser run).

This file separates what was run, what passed, and what still needs a person at a machine with a camera or a speaker. Do not treat "not run" as "passed."

## 1. Automated tests (run on 2026-11-08)

| Suite | Command | Result |
| --- | --- | --- |
| Backend unit and API | `cd backend; python -m pytest` | 57 passed, 3 skipped (hardware tests are opt-in) |
| Backend hardware (real webcam) | `$env:SIGNBRIDGE_RUN_CAMERA_TESTS="1"; python -m pytest -m hardware` | 3 passed (re-run on 2026-11-09, after the Phase 5 to 9 changes) |
| AI engine (pipeline, real detector on fixtures) | `cd backend; python -m pytest ..\ai-engine\tests` | 30 passed |
| Frontend unit and component | `cd frontend; npm test` | 67 passed |
| Frontend production build | `cd frontend; npm run build` | Succeeded |

What the automated tests cover:
- Camera lifecycle, MJPEG framing, and error mapping (503, 409, release on stop).
- MediaPipe output on real photos: no hand, one hand (21 landmarks), two hands (42), connections drawn.
- Landmark and recognition API states, including processing errors that clear stale hands.
- Settings validation, feature normalization, the recognizer threshold, and the training refusal path.
- Recording tool validation (verified labels only, pseudonyms, consent references) and its real frame path.
- Frontend: routes, API errors (including the Vite proxy 502), camera and landmark hooks, the recognition panel, the text buffer (hold, repeat, reset, undo, clear), speech (text equals displayed text), and the learning progress.

What the automated tests do not cover: real sign accuracy, real speech output, two live hands on a camera, performance under load, and any browser other than the one used for the earlier manual run.

## 2. Measured performance

From `backend/scripts/benchmark_detection.py --runs 100` on the machine above, using the app's detector settings:

| Image | Size | Median | p95 | Max |
| --- | --- | --- | --- | --- |
| hand_thumb_up.jpg | 640 x 521 | 32.2 ms | 35.1 ms | 37.3 ms |
| two_hands_composite.jpg | 1328 x 480 | 30.0 ms | 31.2 ms | 32.3 ms |

Detection alone takes about 30 ms per frame, so it can keep up with a 30 fps camera on this CPU. The full pipeline also draws annotations and encodes JPEG frames, which this benchmark does not include. Recognition latency is not measured, because no trained model exists.

## 3. Manual hardware and audio checks

These need a person. Mark each one with the date, the browser, and the result.

| Check | Expected | Result |
| --- | --- | --- |
| Camera available, live feed visible | Live video, "Live" badge | Passed (2026-11-08, user report) |
| Camera busy in another app | Clear error, no crash | Not reported |
| Camera unplugged while live | "stream interrupted" or "stopped" message | Not reported |
| No hand | "No hand detected", no coordinates | Passed (user report) |
| One left hand, one right hand | Labels match the hand shown | Passed (user report) |
| Two hands | Hand count 2, 21 rows each | Not reported on a live camera |
| Hand moving in and out of frame | Coordinates update, then clear | Moving hand passed (user report) |
| Poor and bright lighting | Detection degrades, no false letters | Not run |
| Five start/stop cycles | Camera restarts each time | Passed (user report) |
| Refresh while live | Camera stops or restarts cleanly | Not run |
| Backend stopped while live | "Cannot reach the SignBridge backend" message | Fixed in code; re-check in browser |
| Speak text | Audible speech of the visible text | Not run (needs speakers) |
| Speech in a browser without voices | Clear notice, no crash | Not run |
| Letter recognition, C, L, O, S, U, V | Correct letter after a steady hold | Not run (no trained model) |

## 4. Browser and device support

| Item | Status |
| --- | --- |
| Windows 11, Chrome (desktop) | Used for development and the earlier manual run |
| Edge, Firefox | Not tested |
| macOS, Linux | Not tested. The backend uses DirectShow on Windows and the default backend elsewhere. Camera behaviour is unverified |
| Mobile browsers | Not tested. The backend needs a webcam attached to the same machine, so phone use is not supported |
| Python 3.11 and 3.12 | Declared as supported in the README. Only 3.13.5 was tested |

## 5. Deployment decision

- **Local-first.** The Python backend opens the webcam of the machine it runs on. A remote server cannot open a visitor's webcam, so a hosted backend cannot provide the live camera feature.
- **No public deployment yet.** The camera stream is unencrypted HTTP on localhost. The plan requires privacy and consent review before any deployment.
- **If a hosted version is needed later:** the browser would capture frames with `getUserMedia()` and send landmarks, not video, to the backend. This is not implemented, and it would need a separate privacy review.

## 6. Open items before a final report

1. Live two-hand check and the remaining manual rows above.
2. Recognition accuracy, using a trained model on held-out participants (Phase 4).
3. Speech check with audible output.
5. Long soak test (for example, 30 minutes of start and stop with a memory and handle check).
