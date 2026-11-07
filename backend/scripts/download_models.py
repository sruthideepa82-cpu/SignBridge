"""Download MediaPipe model files used by SignBridge into backend/models/.

Usage (from the backend folder):  python scripts/download_models.py
"""

import hashlib
import sys
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BACKEND_DIR / "models"

MODELS = {
    "hand_landmarker.task": {
        "url": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
        "sha256": None,
    },
}


def download(name: str, url: str, destination: Path) -> None:
    print(f"Downloading {name} ...")
    temporary = destination.with_suffix(destination.suffix + ".part")
    with urllib.request.urlopen(url, timeout=60) as response, temporary.open("wb") as output:
        output.write(response.read())
    temporary.replace(destination)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    print(f"Saved {destination} ({destination.stat().st_size:,} bytes, sha256 {digest[:12]}...)")


def main() -> int:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for name, spec in MODELS.items():
        destination = MODELS_DIR / name
        if destination.exists():
            print(f"{name} already present, skipping.")
            continue
        download(name, spec["url"], destination)
    return 0


if __name__ == "__main__":
    sys.exit(main())
