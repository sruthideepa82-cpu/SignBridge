"""Run MediaPipe Hands on every phrase image and store the raw landmarks of up to two hands.

Usage (from the repository root, with backend/.venv):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_recognition\\extract_landmarks.py

Reads ai-engine/dataset/public/isl_phrases/images/images for phrases/<phrase>/<file>.
Writes ai-engine/dataset/public/isl_phrases/landmarks.npz and landmarks_per_image.csv.

Images are never modified. Each image is decoded from its bytes, so JPEG content stored under a .png
name is read correctly. Detection uses the same MediaPipe model and settings as the alphabet pipeline
(IMAGE mode, up to two hands, 0.5 confidence thresholds).
"""

import argparse
import csv
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
BACKEND = REPO / "backend"
sys.path.insert(0, str(BACKEND))

from mediapipe import Image, ImageFormat  # noqa: E402
from mediapipe.tasks.python import BaseOptions  # noqa: E402
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode  # noqa: E402
from PIL import Image as PILImage  # noqa: E402

DATASET = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
IMAGE_ROOT = DATASET / "images" / "images for phrases"
HAND_MODEL = BACKEND / "models" / "hand_landmarker.task"
LANDMARK_COUNT = 21
SLOTS = ("Left", "Right")


def build_landmarker() -> HandLandmarker:
    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(HAND_MODEL)),
        running_mode=RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return HandLandmarker.create_from_options(options)


def detect_hands(landmarker: HandLandmarker, path: Path) -> dict:
    with PILImage.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    result = landmarker.detect(Image(image_format=ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    landmarks = np.full((2, LANDMARK_COUNT, 3), np.nan, dtype=np.float32)
    scores = np.full(2, np.nan, dtype=np.float32)
    present = np.zeros(2, dtype=bool)
    for hand_points, handedness in zip(result.hand_landmarks or [], result.handedness or []):
        category = handedness[0]
        slot = SLOTS.index(category.category_name) if category.category_name in SLOTS else None
        if slot is None or present[slot]:
            continue
        landmarks[slot] = [[p.x, p.y, p.z] for p in hand_points]
        scores[slot] = category.score
        present[slot] = True
    return {"landmarks": landmarks, "scores": scores, "present": present}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="Process only the first N images (for testing).")
    args = parser.parse_args()

    phrases = sorted(p.name for p in IMAGE_ROOT.iterdir() if p.is_dir())
    items = []
    for phrase in phrases:
        for path in sorted((IMAGE_ROOT / phrase).iterdir(), key=lambda p: int(p.stem)):
            items.append((phrase, path))
    if args.limit:
        items = items[: args.limit]

    landmarker = build_landmarker()
    all_landmarks, all_scores, rows = [], [], []
    try:
        for index, (phrase, path) in enumerate(items):
            detected = detect_hands(landmarker, path)
            all_landmarks.append(detected["landmarks"])
            all_scores.append(detected["scores"])
            hand_slots = [SLOTS[i] for i in range(2) if detected["present"][i]]
            rows.append(
                {
                    "index": index,
                    "phrase": phrase,
                    "file": path.name,
                    "hands_detected": int(detected["present"].sum()),
                    "hand_slots": "+".join(hand_slots),
                    "left_score": "" if np.isnan(detected["scores"][0]) else round(float(detected["scores"][0]), 4),
                    "right_score": "" if np.isnan(detected["scores"][1]) else round(float(detected["scores"][1]), 4),
                }
            )
            if (index + 1) % 200 == 0:
                print(f"{index + 1}/{len(items)} images")
    finally:
        landmarker.close()

    DATASET.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        DATASET / "landmarks.npz",
        landmarks=np.stack(all_landmarks),
        scores=np.stack(all_scores),
        phrase=np.array([phrase for phrase, _ in items]),
        image_file=np.array([path.name for _, path in items]),
    )
    with (DATASET / "landmarks_per_image.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    detected_total = sum(row["hands_detected"] > 0 for row in rows)
    print(f"images: {len(rows)}, with at least one hand: {detected_total}")
    print(f"wrote {DATASET / 'landmarks.npz'}")


if __name__ == "__main__":
    main()
