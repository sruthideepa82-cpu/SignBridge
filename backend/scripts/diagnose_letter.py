"""Show exactly what the live letter recognizer sees for one hand, frame by frame.

Usage (from backend/):
    python scripts/diagnose_letter.py --camera 0 --frames 20 --out ../diagnostics/letter.json
    python scripts/diagnose_letter.py --image "path/to/C.jpg"

Camera mode uses the same OpenCV capture, the same MediaPipe VIDEO-mode HandDetector and the same
StaticRecognizer as the Live Studio endpoint. For each frame it prints the 21 landmarks, the 63 normalized
features, all class probabilities, the predicted label and whether the model's own predict_proba agrees
with the recognizer. Nothing is sent to the server and no prediction is changed.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import joblib
import numpy as np

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.services.camera_service import open_default_capture  # noqa: E402
from app.services.hand_detection_service import HandDetector  # noqa: E402
from app.services.landmark_features import normalize_hand  # noqa: E402
from app.services.recognition_service import StaticRecognizer  # noqa: E402


def describe(detector: HandDetector, recognizer: StaticRecognizer, bundle: dict, frame_bgr: np.ndarray, label: str) -> dict:
    result = detector.detect(frame_bgr)
    record = {"frame": label, "hand_count": len(result.hands)}
    if len(result.hands) != 1:
        record["status"] = "no_hand" if not result.hands else "two_hands"
        return record

    hand = result.hands[0]
    points = [[p.x, p.y, p.z] for p in hand.landmarks]
    features = normalize_hand(points)
    prediction = recognizer.predict(points)
    probabilities = bundle["model"].predict_proba(features.reshape(1, -1))[0]
    ranked = sorted(zip(bundle["labels"], probabilities.tolist()), key=lambda item: -item[1])
    record.update(
        {
            "handedness": hand.handedness,
            "handedness_score": round(hand.score, 4),
            "landmarks": [[p.name, round(p.x, 5), round(p.y, 5), round(p.z, 5)] for p in hand.landmarks],
            "features63": [round(float(v), 5) for v in features],
            "probabilities": [[lab, round(p, 5)] for lab, p in ranked],
            "predicted": prediction.label,
            "confidence": round(prediction.confidence, 5),
            "threshold": recognizer.threshold,
            "accepted": prediction.accepted,
            "direct_argmax": ranked[0][0],
            "direct_confidence": round(ranked[0][1], 5),
            "direct_matches_recognizer": abs(ranked[0][1] - prediction.confidence) < 1e-6,
        }
    )
    return record


def print_record(record: dict) -> None:
    if "landmarks" not in record:
        print(f"{record['frame']}: {record.get('status', 'no_hand')} (hands={record['hand_count']})")
        return
    top = ", ".join(f"{lab} {p:.3f}" for lab, p in record["probabilities"][:4])
    print(
        f"{record['frame']}: {record['handedness']} ({record['handedness_score']:.3f}) "
        f"predicted={record['predicted']} confidence={record['confidence']:.3f} "
        f"accepted={record['accepted']} | top: {top} | direct_matches={record['direct_matches_recognizer']}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--camera", type=int, help="Camera index, for example 0.")
    source.add_argument("--image", type=Path, help="A single image file, processed as one frame.")
    parser.add_argument("--frames", type=int, default=20, help="Camera frames to read.")
    parser.add_argument("--out", type=Path, help="Optional JSON file for the full per-frame records.")
    args = parser.parse_args()

    settings = get_settings()
    recognizer = StaticRecognizer(settings.recognition_model_path, settings.recognition_threshold)
    if not recognizer.available:
        raise SystemExit(recognizer.error)
    bundle = joblib.load(settings.recognition_model_path)
    detector = HandDetector(
        settings.hand_model_path,
        max_hands=settings.hand_max_hands,
        min_detection_confidence=settings.hand_min_detection_confidence,
        min_presence_confidence=settings.hand_min_presence_confidence,
        min_tracking_confidence=settings.hand_min_tracking_confidence,
    )

    records = []
    try:
        if args.image:
            frame = cv2.imread(str(args.image))
            if frame is None:
                raise SystemExit(f"Could not read image: {args.image}")
            records.append(describe(detector, recognizer, bundle, frame, args.image.name))
        else:
            capture = open_default_capture(args.camera)
            if not capture.isOpened():
                raise SystemExit(f"Could not open camera {args.camera}.")
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, settings.camera_width)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.camera_height)
            try:
                for index in range(args.frames):
                    ok, frame = capture.read()
                    if not ok:
                        continue
                    records.append(describe(detector, recognizer, bundle, frame, f"frame {index}"))
                    time.sleep(0.05)
            finally:
                capture.release()
    finally:
        detector.close()

    for record in records:
        print_record(record)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(records, indent=2), encoding="utf-8")
        print(f"wrote {len(records)} records to {args.out}")


if __name__ == "__main__":
    main()
