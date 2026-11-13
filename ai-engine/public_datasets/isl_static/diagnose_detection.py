"""Checks whether MediaPipe misses hands on the public dataset because of its confidence settings.

Samples images that the main extraction found no hand in, plus a control group where a hand was found. Each sample is
re-run with lower detection thresholds. Read-only with respect to the dataset. Writes a JSON summary to --out.
"""

import argparse
import csv
import json
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from mediapipe import Image as MpImage
from mediapipe import ImageFormat
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

THRESHOLDS = (0.5, 0.2)


def landmarker(model: Path, threshold: float) -> HandLandmarker:
    return HandLandmarker.create_from_options(HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model)),
        running_mode=RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=threshold,
        min_hand_presence_confidence=threshold,
        min_tracking_confidence=threshold,
    ))


def detects(detector: HandLandmarker, path: Path) -> bool:
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    result = detector.detect(MpImage(image_format=ImageFormat.SRGB, data=rgb))
    return bool(result.hand_landmarks)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--sample", type=int, default=300)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    with (args.out / "landmarks.csv").open(newline="", encoding="utf-8") as handle:
        landmarks = {row["file_id"]: row for row in csv.DictReader(handle)}
    with (args.out / "decode.csv").open(newline="", encoding="utf-8") as handle:
        decode = {row["file_id"]: row for row in csv.DictReader(handle)}

    missed = [fid for fid, row in landmarks.items() if row["detected"] != "True"]
    found = [fid for fid, row in landmarks.items() if row["detected"] == "True"]
    rng = random.Random(args.seed)
    missed_sample = rng.sample(missed, min(args.sample, len(missed)))
    control_sample = rng.sample(found, min(args.sample // 3, len(found)))

    report = {"sample_missed": len(missed_sample), "sample_control": len(control_sample), "thresholds": {}}
    for threshold in THRESHOLDS:
        detector = landmarker(args.model, threshold)
        recovered = sum(detects(detector, args.root / decode[fid]["rel_path"]) for fid in missed_sample)
        kept = sum(detects(detector, args.root / decode[fid]["rel_path"]) for fid in control_sample)
        report["thresholds"][str(threshold)] = {
            "missed_images_now_detected": recovered,
            "missed_recovery_rate": round(recovered / len(missed_sample), 4) if missed_sample else None,
            "control_still_detected": kept,
            "control_retention_rate": round(kept / len(control_sample), 4) if control_sample else None,
        }
        print(f"threshold {threshold}: recovered {recovered}/{len(missed_sample)} missed, "
              f"kept {kept}/{len(control_sample)} controls", flush=True)
        detector.close()

    (args.out / "detection_diagnostic.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
