# SignBridge AI Engine

This folder holds the machine-learning work behind SignBridge. **No model is implemented yet.**
The current application captures webcam frames and detects hand landmarks (see `backend/app/services/`).

**Phase 3 (dataset design) status:** the protocol, source register, and recording tool exist. No class is verified and no data has been recorded. See [`dataset/README.md`](dataset/README.md) and `dataset/metadata/vocabulary.json`.

- `collection/collect_static.py` records landmark samples for one verified class from the webcam. It refuses unverified labels, non-pseudonymous participant IDs, and missing consent references.
- `collection/sample_record.py` holds the pure validation and record logic.
- `collection/dataset_stats.py` prints class counts and checks the participant-level split.
- `dataset/templates/` holds the reviewer worksheet, consent draft, and participant register template.
- `training/prepare_dataset.py` and `training/train_static_classifier.py` build and evaluate the static classifier. They refuse to train without enough participants per split.
- `tests/` runs the unit tests (27 passing, synthetic data only): `cd backend; .\.venv\Scripts\python.exe -m pytest ..\ai-engine\tests`.

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
