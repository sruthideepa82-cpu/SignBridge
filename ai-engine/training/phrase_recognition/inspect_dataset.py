"""Inventory the 44-phrase image dataset and classify each phrase as static or dynamic.

Usage (from the repository root):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_recognition\\inspect_dataset.py

Needs landmarks.npz from extract_landmarks.py. Writes reports under ai-engine/dataset/public/isl_phrases/.
The original images and the archive are only read, never changed.

Static rule (fixed in this file; the wrist scale was corrected after a first run, see the report):
    Frames are ordered by their numeric file name. For each hand, wrist positions are divided by that hand's
    median hand size across the clip (the scale used by normalize_hand). wrist_range is the largest distance
    from the mean wrist position, taking the more-moving hand.
    shape_p90 is the 90th percentile of the distance of each frame's normalize_hand() vector from the clip median.
    A phrase is STATIC when wrist_range <= MOTION_RANGE_LIMIT AND shape_p90 <= SHAPE_CHANGE_LIMIT.
    Otherwise DYNAMIC. Phrases with fewer than MIN_DETECTED_FRAMES usable frames are UNDETERMINED.
"""

import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend"))

from app.services.landmark_features import normalize_hand  # noqa: E402

DATASET = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
IMAGE_ROOT = DATASET / "images" / "images for phrases"
MOTION_RANGE_LIMIT = 0.75
SHAPE_CHANGE_LIMIT = 1.0
MIN_DETECTED_FRAMES = 20
MOTION_CONSTANT = {"static": "STATIC", "dynamic": "DYNAMIC"}


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_rows() -> list[dict]:
    rows = []
    for phrase_dir in sorted(p for p in IMAGE_ROOT.iterdir() if p.is_dir()):
        for path in sorted(phrase_dir.iterdir(), key=lambda p: int(p.stem)):
            row = {"phrase": phrase_dir.name, "file": path.name, "relative_path": f"images for phrases/{phrase_dir.name}/{path.name}", "bytes": path.stat().st_size}
            try:
                with Image.open(path) as image:
                    row.update(width=image.width, height=image.height, mode=image.mode, real_format=image.format)
                row["sha256"] = sha256_of(path)
                row["readable"] = True
            except Exception as error:
                row.update(readable=False, error=f"{type(error).__name__}: {error}", sha256="", real_format="", width="", height="", mode="")
            row["extension_matches_format"] = (path.suffix.lower() == ".png") == (row["real_format"] == "PNG")
            rows.append(row)
    return rows


def duplicate_groups(rows: list[dict]) -> dict[str, int]:
    group_of = {}
    counts = Counter(row["sha256"] for row in rows if row.get("sha256"))
    next_id = 1
    for row in rows:
        digest = row.get("sha256", "")
        if not digest or counts[digest] == 1:
            row["duplicate_group"] = ""
            continue
        if digest not in group_of:
            group_of[digest] = f"D{next_id:03d}"
            next_id += 1
        row["duplicate_group"] = group_of[digest]
    return group_of


def phrase_motion(landmarks: np.ndarray, present: np.ndarray, files: list[str]) -> dict:
    """landmarks: (n, 2, 21, 3) for one phrase in file-number order. present: (n, 2) bool."""
    usable = {slot: [] for slot in range(2)}
    for frame in range(len(landmarks)):
        for slot in range(2):
            if not present[frame, slot]:
                continue
            points = landmarks[frame, slot]
            try:
                normalize_hand(points)
            except ValueError:
                continue
            usable[slot].append((frame, points[0, :2], float(np.linalg.norm(points[9, :2] - points[0, :2]))))
    result = {"detected_hand_frames": sum(len(v) for v in usable.values())}
    if result["detected_hand_frames"] < MIN_DETECTED_FRAMES:
        result.update(motion_range=None, shape_p90=None, motion_class="UNDETERMINED", dominant_hand="")
        return result
    ranges, shapes = {}, {}
    for slot in range(2):
        if len(usable[slot]) < MIN_DETECTED_FRAMES:
            continue
        clip_scale = float(np.median([size for _, _, size in usable[slot]]))
        track = np.array([wrist / clip_scale for _, wrist, _ in usable[slot]])
        ranges[slot] = float(np.max(np.linalg.norm(track - track.mean(axis=0), axis=1)))
        hand_features = np.stack([normalize_hand(landmarks[frame, slot]) for frame, _, _ in usable[slot]])
        deviation = np.linalg.norm(hand_features - np.median(hand_features, axis=0), axis=1)
        shapes[slot] = float(np.percentile(deviation, 90))
    if not ranges:
        result.update(motion_range=None, shape_p90=None, motion_class="UNDETERMINED", dominant_hand="")
        return result
    moving_slot = max(ranges, key=ranges.get)
    motion_range = ranges[moving_slot]
    shape_p90 = shapes[moving_slot]
    is_static = motion_range <= MOTION_RANGE_LIMIT and shape_p90 <= SHAPE_CHANGE_LIMIT
    result.update(
        motion_range=round(motion_range, 4),
        shape_p90=round(shape_p90, 4),
        motion_class="STATIC" if is_static else "DYNAMIC",
        dominant_hand=["Left", "Right"][moving_slot],
    )
    return result


def hand_configuration(present: np.ndarray) -> str:
    both = int((present.sum(axis=1) == 2).sum())
    one = int((present.sum(axis=1) == 1).sum())
    none = int((present.sum(axis=1) == 0).sum())
    return f"both={both};one={one};none={none}"


def main() -> None:
    rows = image_rows()
    duplicate_groups(rows)
    data = np.load(DATASET / "landmarks.npz")
    landmarks, phrase_of_landmark = data["landmarks"], data["phrase"]
    present = ~np.isnan(landmarks[:, :, 0, 0])

    with (DATASET / "image_inventory.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    phrases = sorted(set(phrase_of_landmark.tolist()))
    summary, phrase_rows = [], []
    for phrase in phrases:
        indices = np.where(phrase_of_landmark == phrase)[0]
        order = sorted(indices.tolist(), key=lambda i: int(Path(str(data["image_file"][i])).stem))
        images = [r for r in rows if r["phrase"] == phrase]
        unique = len({r["sha256"] for r in images if r["sha256"]})
        motion = phrase_motion(landmarks[order], present[order], [str(data["image_file"][i]) for i in order])
        frames_with_hand = int(present[order].any(axis=1).sum())
        two_hand_frames = int((present[order].sum(axis=1) == 2).sum())
        phrase_rows.append(
            {
                "phrase": phrase,
                "images": len(order),
                "unique_images": unique,
                "exact_duplicates": len(order) - unique,
                "frames_with_any_hand": frames_with_hand,
                "frames_with_two_hands": two_hand_frames,
                "hand_configuration": hand_configuration(present[order]),
                "dominant_hand": motion["dominant_hand"],
                "motion_range": motion["motion_range"],
                "shape_p90": motion["shape_p90"],
                "motion_class": motion["motion_class"],
            }
        )
    with (DATASET / "phrase_inventory.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(phrase_rows[0].keys()))
        writer.writeheader()
        writer.writerows(phrase_rows)

    corrupt = [r for r in rows if not r["readable"]]
    mismatched = [r for r in rows if not r["extension_matches_format"]]
    dup_groups = defaultdict(list)
    for r in rows:
        if r["duplicate_group"]:
            dup_groups[r["duplicate_group"]].append(f'{r["phrase"]}/{r["file"]}')
    cross_phrase = [g for g in dup_groups.values() if len({x.split("/")[0] for x in g}) > 1]
    report = {
        "total_images": len(rows),
        "phrases": len(phrases),
        "images_per_phrase": dict(Counter(r["phrase"] for r in rows)),
        "sizes": {f"{w}x{h}": n for (w, h), n in Counter((r["width"], r["height"]) for r in rows).items()},
        "real_formats": dict(Counter(r["real_format"] for r in rows)),
        "extension_mismatch_count": len(mismatched),
        "corrupt_count": len(corrupt),
        "corrupt_files": [r["relative_path"] for r in corrupt],
        "exact_duplicate_groups": len(dup_groups),
        "exact_duplicate_files": sum(len(g) for g in dup_groups.values()),
        "cross_phrase_duplicate_groups": len(cross_phrase),
        "motion_classes": dict(Counter(r["motion_class"] for r in phrase_rows)),
        "motion_range_limit": MOTION_RANGE_LIMIT,
        "shape_change_limit": SHAPE_CHANGE_LIMIT,
        "min_detected_frames": MIN_DETECTED_FRAMES,
    }
    (DATASET / "inventory_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
