# SignBridge AI Engine

This folder is reserved for the machine-learning work behind SignBridge. **No model is implemented yet.**
The current application only captures webcam frames (see `backend/app/services/camera_service.py`).

## Layout

| Folder      | Purpose                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `dataset/`  | Recorded Indian Sign Language samples and labels (not committed to git) |
| `training/` | Training, evaluation, and data-collection scripts                        |
| `models/`   | Exported model artifacts used by the backend (not committed to git)     |

## Planned pipeline

1. **Hand landmarks**: MediaPipe Hands extracts 21 landmarks per hand from the webcam frame.
2. **Feature extraction**: landmarks are normalized (wrist-relative, scale-invariant) into feature vectors.
3. **Classification**: a TensorFlow/Keras model maps feature vectors to ISL gesture labels.
4. **Integration**: the backend recognition service consumes frames from `CameraService` and returns
   predictions with confidence scores. The frontend displays them only after the model is validated.

## Dependencies

MediaPipe and TensorFlow are intentionally not in `backend/requirements.txt` yet. They are large and are
not needed until the recognition milestone. Add them with a separate `backend/requirements-ai.txt` when
that work starts.
