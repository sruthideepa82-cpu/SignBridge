"""Checks a candidate static model before it replaces the active one.

1. Loads the candidate through the backend StaticRecognizer, the same loader Live Studio uses.
2. Parity: on stored training features, the recognizer and the raw model give the same letter.
3. Live path: real MediaPipe on held-out test images. The raw landmarks go through StaticRecognizer.predict(), the
   same route a webcam frame takes, and the predicted letter is compared with the folder label.

Writes validation.json next to the candidate. Exits non-zero when a check fails.
"""

import argparse
import csv
import json
import random
import sys
from pathlib import Path

import joblib
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
BACKEND_DIR = HERE.parents[2] / "backend"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BACKEND_DIR))

from app.services.recognition_service import StaticRecognizer  # noqa: E402
import inspect_isl_static as extraction  # noqa: E402


def parity_check(recognizer: StaticRecognizer, bundle_path: Path, features: np.ndarray, samples: int, seed: int) -> dict:
    model = joblib.load(bundle_path)["model"]
    rows = random.Random(seed).sample(range(features.shape[0]), min(samples, features.shape[0]))
    mismatches = 0
    for row in rows:
        probabilities = model.predict_proba(features[row:row + 1])[0]
        direct_label = str(model.classes_[int(np.argmax(probabilities))])
        prediction = recognizer.predict(features[row].reshape(21, 3).tolist())
        if prediction.label is not None and prediction.label != direct_label:
            mismatches += 1
    return {"rows_checked": len(rows), "label_mismatches": mismatches}


def raw_landmarks(image_path: Path) -> list | None:
    """Raw MediaPipe points for the most confident hand, the same route a webcam frame takes."""
    from mediapipe import Image as MpImage
    from mediapipe import ImageFormat

    with Image.open(image_path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    detection = extraction._landmarker.detect(MpImage(image_format=ImageFormat.SRGB, data=rgb))
    if not detection.hand_landmarks:
        return None
    best = max(range(len(detection.hand_landmarks)), key=lambda i: detection.handedness[i][0].score)
    return [[point.x, point.y, point.z] for point in detection.hand_landmarks[best]]


def live_path_check(recognizer: StaticRecognizer, rows: list[tuple[str, str]], root: Path) -> dict:
    scored = correct = accepted = accepted_correct = 0
    per_label: dict[str, list[int]] = {}
    for label, rel_path in rows:
        points = raw_landmarks(root / rel_path)
        if points is None:
            continue
        prediction = recognizer.predict(points)
        scored += 1
        hit = prediction.label == label
        correct += int(hit)
        counts = per_label.setdefault(label, [0, 0])
        counts[0] += int(hit)
        counts[1] += 1
        if prediction.accepted:
            accepted += 1
            accepted_correct += int(hit)
    return {
        "images_tried": len(rows),
        "hands_detected_and_scored": scored,
        "argmax_accuracy_at_any_confidence": round(correct / scored, 4) if scored else None,
        "accepted_at_threshold": accepted,
        "accepted_accuracy": round(accepted_correct / accepted, 4) if accepted else None,
        "per_label": {label: {"correct": c, "total": t} for label, (c, t) in sorted(per_label.items())},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--candidate", type=Path, required=True, help="candidate/static_classifier.joblib")
    parser.add_argument("--dataset-out", type=Path, required=True, help="Folder with features63.npz.")
    parser.add_argument("--training-out", type=Path, required=True, help="Folder with test_paths.csv.")
    parser.add_argument("--root", type=Path, required=True, help="The dataset 'ISL Images' folder (read-only).")
    parser.add_argument("--model", type=Path, default=extraction.DEFAULT_MODEL, help="MediaPipe hand_landmarker.task")
    parser.add_argument("--live-samples", type=int, default=150)
    parser.add_argument("--threshold", type=float, default=0.6)
    args = parser.parse_args()

    recognizer = StaticRecognizer(args.candidate, threshold=args.threshold)
    if not recognizer.available:
        print(f"FAIL: candidate did not load: {recognizer.error}")
        return 1

    features = np.load(args.dataset_out / "features63.npz")["X"].astype(np.float32)
    parity = parity_check(recognizer, args.candidate, features, samples=500, seed=0)

    with (args.training_out / "test_paths.csv").open(newline="", encoding="utf-8") as handle:
        test_rows = [(row["label"], row["rel_path"]) for row in csv.DictReader(handle)]
    sample = random.Random(0).sample(test_rows, min(args.live_samples, len(test_rows)))
    extraction._init_landmarker(str(args.model))
    live = live_path_check(recognizer, sample, args.root)

    passed = parity["label_mismatches"] == 0 and live["hands_detected_and_scored"] > 0
    report = {"candidate": str(args.candidate), "threshold": args.threshold, "parity": parity,
              "live_path": live, "passed": passed}
    (args.candidate.parent / "validation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
