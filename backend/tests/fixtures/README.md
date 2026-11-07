# Test image fixtures

These photos are used by the hand detection tests to run real MediaPipe inference.

| File | Source | Used for |
| --- | --- | --- |
| `hand_thumb_up.jpg` | [google-ai-edge/mediapipe-samples](https://github.com/google-ai-edge/mediapipe-samples) (`examples/gesture_recognizer/android/app/src/androidTest/assets/hand_thumb_up.jpg`), Apache 2.0 | One hand, 21 landmarks |
| `hand_landmarker_test_image.jpg` | mediapipe-samples (`examples/hand_landmarker/android/app/src/androidTest/assets/test_image.jpg`), Apache 2.0 | One hand, 21 landmarks |
| `two_hands_composite.jpg` | Created for this project by placing the two images above side by side (no edits to the hands) | Two hands, 42 landmarks |

The MediaPipe hand model (`backend/models/hand_landmarker.task`) is distributed by Google under the Apache 2.0 license.
