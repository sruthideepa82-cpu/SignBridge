"""Record labelled landmark samples for a verified static sign from the local webcam.

Usage (from the backend folder, after the backend venv is set up):

    python ..\\ai-engine\\collection\\collect_static.py --label "<verified label>" \\
        --participant P001 --consent-ref C-2026-001 --samples 50

Requirements before recording:
- The label must be listed as verified in ai-engine/dataset/metadata/vocabulary.json.
- The participant must have signed the consent form. Its reference is passed with --consent-ref.
- Only landmark coordinates are written to ai-engine/dataset/raw/ (gitignored). No video is saved.
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2

AI_ENGINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = AI_ENGINE_DIR.parent
BACKEND_DIR = REPO_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.config import Settings  # noqa: E402
from app.services.camera_service import open_default_capture  # noqa: E402
from app.services.hand_detection_service import HandDetector  # noqa: E402
from sample_record import (  # noqa: E402
    accept_hands,
    build_sample,
    load_vocabulary,
    validate_consent_ref,
    validate_participant,
    verified_classes,
)

DEFAULT_VOCABULARY = AI_ENGINE_DIR / "dataset" / "metadata" / "vocabulary.json"
DEFAULT_OUTPUT = AI_ENGINE_DIR / "dataset" / "raw"
MIN_FRAME_GAP_SECONDS = 0.2
GIVE_UP_AFTER_SECONDS = 300
WINDOW_NAME = "SignBridge collection (press q to stop)"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Record labelled hand landmark samples.")
    parser.add_argument("--label", required=True, help="A verified class label from vocabulary.json.")
    parser.add_argument("--participant", required=True, help="Pseudonymous participant ID, e.g. P001.")
    parser.add_argument("--consent-ref", required=True, help="Reference of the signed consent record.")
    parser.add_argument("--samples", type=int, default=50, help="Number of accepted samples to record.")
    parser.add_argument("--min-score", type=float, default=0.8, help="Minimum hand score to accept a frame.")
    parser.add_argument("--vocabulary", type=Path, default=DEFAULT_VOCABULARY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--camera-index", type=int, default=None, help="Defaults to SIGNBRIDGE_CAMERA_INDEX.")
    return parser.parse_args(argv)


def detect_hands(detector: HandDetector, frame) -> list[dict]:
    """Run the backend's MediaPipe detector on one BGR frame and convert the result to plain dicts."""
    result = detector.detect(frame)
    return [
        {
            "handedness": hand.handedness,
            "score": hand.score,
            "landmarks": [(p.x, p.y, p.z) for p in hand.landmarks],
        }
        for hand in result.hands
    ]


def capture_session(args: argparse.Namespace, entry: dict, settings: Settings) -> int:
    expected_hands = int(entry["hands"])
    session_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    session_dir = args.output
    session_dir.mkdir(parents=True, exist_ok=True)
    samples_path = session_dir / f"{args.label}__{args.participant}__{session_id}.jsonl"
    manifest_path = session_dir / f"{args.label}__{args.participant}__{session_id}.session.json"
    if samples_path.exists():
        raise FileExistsError(f"Refusing to overwrite {samples_path}")

    camera_index = settings.camera_index if args.camera_index is None else args.camera_index
    capture = open_default_capture(camera_index)
    if not capture.isOpened():
        capture.release()
        raise RuntimeError("The webcam could not be opened. Close other camera apps and try again.")
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, settings.camera_width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.camera_height)

    detector = HandDetector(settings.hand_model_path, max_hands=2)
    manifest = {
        "label": args.label,
        "participant": args.participant,
        "session": session_id,
        "consent_ref": args.consent_ref,
        "expected_hands": expected_hands,
        "min_score": args.min_score,
        "camera_index": camera_index,
        "camera_width": settings.camera_width,
        "camera_height": settings.camera_height,
        "started_at": datetime.now().isoformat(timespec="seconds"),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    accepted = 0
    last_capture = 0.0
    started = time.monotonic()
    try:
        while accepted < args.samples:
            if time.monotonic() - started > GIVE_UP_AFTER_SECONDS:
                print("Stopped: time limit reached before the target count.")
                break
            ok, frame = capture.read()
            if not ok or frame is None:
                time.sleep(0.05)
                continue

            cv2.imshow(WINDOW_NAME, frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                print("Stopped by user.")
                break

            if time.monotonic() - last_capture < MIN_FRAME_GAP_SECONDS:
                continue
            hands = detect_hands(detector, frame)
            if not accept_hands(hands, expected_hands, args.min_score):
                continue

            sample = build_sample(
                label=args.label,
                participant=args.participant,
                session_id=session_id,
                sample_index=accepted,
                captured_at=datetime.now().isoformat(timespec="milliseconds"),
                hands=hands,
            )
            with samples_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(sample) + "\n")
            accepted += 1
            last_capture = time.monotonic()
            print(f"Recorded {accepted}/{args.samples}")
    finally:
        detector.close()
        capture.release()
        cv2.destroyAllWindows()

    print(f"Wrote {accepted} samples to {samples_path}")
    return accepted


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    validate_participant(args.participant)
    validate_consent_ref(args.consent_ref)

    vocabulary = load_vocabulary(args.vocabulary)
    classes = verified_classes(vocabulary)
    if args.label not in classes:
        print(
            f"Label '{args.label}' is not a verified class in {args.vocabulary}. "
            "Verify it against a reference and mark it verified before recording.",
            file=sys.stderr,
        )
        return 2

    settings = Settings()
    capture_session(args, classes[args.label], settings)
    return 0


if __name__ == "__main__":
    sys.exit(main())
