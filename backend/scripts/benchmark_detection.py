"""Measure MediaPipe hand-detection latency on this machine, using the same detector settings as the app.

Usage (from the backend folder):  python scripts/benchmark_detection.py [--runs 100]

Reports median and 95th-percentile time per frame for the fixture photos. The result depends on the
machine, so record the machine details next to any number you quote.
"""

import argparse
import platform
import statistics
import sys
import time
from pathlib import Path

import cv2

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.hand_detection_service import HandDetector  # noqa: E402

FIXTURES = BACKEND_DIR / "tests" / "fixtures"
MODEL = BACKEND_DIR / "models" / "hand_landmarker.task"
IMAGES = ["hand_thumb_up.jpg", "two_hands_composite.jpg"]


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(fraction * (len(ordered) - 1))))
    return ordered[index]


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark MediaPipe hand detection per frame.")
    parser.add_argument("--runs", type=int, default=100)
    args = parser.parse_args()

    print(f"Machine: {platform.system()} {platform.release()}, Python {platform.python_version()}, "
          f"{platform.processor() or 'unknown CPU'}")
    for name in IMAGES:
        image = cv2.imread(str(FIXTURES / name))
        detector = HandDetector(MODEL, max_hands=2)
        for _ in range(5):
            detector.detect(image)
        timings_ms = []
        for _ in range(args.runs):
            started = time.perf_counter()
            detector.detect(image)
            timings_ms.append((time.perf_counter() - started) * 1000)
        detector.close()
        print(f"{name} ({image.shape[1]}x{image.shape[0]}, {args.runs} runs): "
              f"median {statistics.median(timings_ms):.1f} ms, "
              f"p95 {percentile(timings_ms, 0.95):.1f} ms, "
              f"max {max(timings_ms):.1f} ms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
