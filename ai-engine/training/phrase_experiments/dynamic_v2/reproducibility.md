# Reproducibility: dynamic_v2 experiment

## Command (repo root)

```
backend\.venv\Scripts\python.exe ai-engine\training\phrase_experiments\dynamic_v2\train_dynamic_v2.py
```

Re-running into an existing folder needs `--overwrite`. The script refuses to overwrite by default.

## Software

- Python 3.13.7 (backend virtual environment)
- scikit-learn 1.9.1, numpy 2.5.4, joblib 1.6.0

The exact versions used are recorded in `experiment_config.json` under `software`.

## Seeds and settings

- Random forest: `random_state = 0`, 300 trees.
- Logistic regression: deterministic solver, `max_iter = 5000`, `C = 1.0`, standard scaling fitted on the fitted windows only.
- Permutation control: seeds 0 to 9, using `numpy.random.default_rng(seed).permutation`.
- Window construction is deterministic (no randomness).

## Inputs and hashes

Recorded in `experiment_config.json` under `inputs_sha256`:
- `ai-engine/dataset/public/isl_phrases/v2/phrase_manifest.csv`
- `ai-engine/dataset/public/isl_phrases/landmarks.npz`

## Protected files

`experiment_config.json` records SHA-256 hashes before and after the run for:
- `ai-engine/models/phrase_classifier.joblib`
- `ai-engine/models/phrase_candidates/static_v1/candidate_full.joblib`
- `ai-engine/models/phrase_candidates/dynamic_v1/reference_bank.npz`

`protected_files_unchanged` must be `true`. The script returns a non-zero exit code if it is not.

## Tests

```
cd ai-engine
..\backend\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider tests/test_dynamic_v2.py
```

Expected: 17 passed. The artifact tests skip if the output folder has not been generated.

## What is not reproducible from this folder alone

- The original video, if any existed. None is in the dataset.
- The stored landmarks were produced by an earlier IMAGE-mode run (Stage 0). Re-running the detector would need the
  MediaPipe model file and could differ slightly across MediaPipe versions.
