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
    "face_landmarker.task": {
        "url": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        "sha256": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
    },
}


def download(name: str, url: str, destination: Path, expected_sha256: str | None) -> None:
    print(f"Downloading {name} ...")
    temporary = destination.with_suffix(destination.suffix + ".part")
    with urllib.request.urlopen(url, timeout=60) as response, temporary.open("wb") as output:
        output.write(response.read())
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
    if expected_sha256 and digest != expected_sha256:
        temporary.unlink()
        raise RuntimeError(f"{name} failed its checksum (got {digest[:12]}..., expected {expected_sha256[:12]}...)")
    temporary.replace(destination)
    print(f"Saved {destination} ({destination.stat().st_size:,} bytes, sha256 {digest[:12]}...)")


def main() -> int:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for name, spec in MODELS.items():
        destination = MODELS_DIR / name
        if destination.exists():
            print(f"{name} already present, skipping.")
            continue
        download(name, spec["url"], destination, spec["sha256"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
