"""Run a pretrained ISL letter classifier on labelled sample images.

Usage (from backend/):
    python scripts/check_isl_letters.py

Each image in tests/fixtures/isl_letters is named after its expected letter (C.png, L.png, ...).
Every image is classified twice: as the full frame, and cropped to the hand found by the
backend's MediaPipe hand detector. The script prints the top predictions and whether the
expected letter is top-1. This is a sanity check only. It does not replace review by a
Deaf ISL signer or qualified ISL interpreter.
"""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image as PILImage
from transformers import pipeline

from app.core.config import get_settings
from app.services.hand_detection_service import HandDetector

BACKEND_DIR = Path(__file__).resolve().parents[1]
IMAGE_DIR = BACKEND_DIR / "tests" / "fixtures" / "isl_letters"
MODEL_ID = "Hemg/Indian-sign-language-classification"
CROP_PADDING = 0.4


def crop_to_hand(frame_bgr: np.ndarray, detector: HandDetector) -> np.ndarray | None:
    result = detector.detect(frame_bgr)
    if not result.hands:
        return None
    height, width = frame_bgr.shape[:2]
    points = result.hands[0].landmarks
    xs = [p.x * width for p in points]
    ys = [p.y * height for p in points]
    side = max(max(xs) - min(xs), max(ys) - min(ys)) * (1 + CROP_PADDING)
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    x0 = int(max(0, cx - side / 2))
    y0 = int(max(0, cy - side / 2))
    x1 = int(min(width, cx + side / 2))
    y1 = int(min(height, cy + side / 2))
    return frame_bgr[y0:y1, x0:x1]


def to_pil(frame_bgr: np.ndarray) -> PILImage.Image:
    return PILImage.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))


def main() -> None:
    settings = get_settings()
    detector = HandDetector(settings.hand_model_path, max_hands=1)
    classifier = pipeline("image-classification", model=MODEL_ID)
    images = sorted(IMAGE_DIR.glob("*.png"))
    if not images:
        raise SystemExit(f"No images found in {IMAGE_DIR}")

    results = {"full frame": 0, "hand crop": 0}
    for path in images:
        expected = path.stem.upper()
        frame = cv2.imread(str(path))
        crop = crop_to_hand(frame, detector)

        variants = {"full frame": frame}
        if crop is None:
            print(f"{expected}: no hand detected, cropped variant skipped")
        else:
            variants["hand crop"] = crop

        for name, image_bgr in variants.items():
            predictions = classifier(to_pil(image_bgr), top_k=3)
            top_text = ", ".join(f"{p['label']} ({p['score']:.3f})" for p in predictions)
            ok = predictions[0]["label"] == expected
            results[name] += ok
            print(f"{expected} [{name}]: top-3 = {top_text} -> {'MATCH' if ok else 'MISS'}")

    detector.close()
    for name, correct in results.items():
        print(f"Top-1 accuracy, {name}: {correct}/{len(images)}")


if __name__ == "__main__":
    main()
