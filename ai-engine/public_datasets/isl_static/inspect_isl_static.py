"""Inspect the public ISL static-gesture dataset (Mendeley DOI 10.17632/7tsw22y96w.1) and extract landmarks.

Stages (run in order, each writes CSV or NPZ into --out):
    scan        walk the dataset and map every file to age group, sleeve, category and label
    decode      open every image, record size, hashes, brightness and sharpness
    landmarks   run MediaPipe Hands on each readable image and build 63-value features with normalize_hand()
    report      write class counts, duplicates, unreadable files, the distribution chart and report.md

The dataset is only ever read. Nothing is written inside --root, and --out must be outside it.

Usage (from the repository root, with the backend virtual environment):
    backend\\.venv\\Scripts\\python.exe ai-engine\\public_datasets\\isl_static\\inspect_isl_static.py ^
        --root "<dataset ISL Images folder>" --out ai-engine\\dataset\\public\\isl_static --stage all
"""

import argparse
import csv
import hashlib
import json
import multiprocessing as mp
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, UnidentifiedImageError

REPO_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = REPO_DIR / "backend"
DEFAULT_MODEL = BACKEND_DIR / "models" / "hand_landmarker.task"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
ENGLISH_LETTERS = [chr(code) for code in range(ord("A"), ord("Z") + 1)]
# Stated in the dataset description: the last frame of a dynamic sign was kept for these letters.
DYNAMIC_LETTERS_STATED = {"H", "J", "Y"}
# Not stated by the dataset. ISL Z is normally a moving sign, so it is flagged for review.
DYNAMIC_LETTERS_SUSPECTED = {"Z"}
DHASH_NEAR_DISTANCE = 3
DHASH_CHUNKS = 4
DHASH_CHUNK_BITS = 16

STAGES = ("scan", "decode", "landmarks", "report")


# ---------- pure helpers (unit tested) ----------

def categorise(folder: str) -> str:
    lowered = folder.lower()
    if "alphabet" in lowered:
        return "alphabet"
    if "hindi" in lowered or "vowel" in lowered:
        return "hindi_vowel"
    if "numeral" in lowered:
        return "numeral"
    return "other"


def label_for(category: str, class_folder: str) -> tuple[str, str]:
    """Return (label, variant). E1/E2 are two signs for E; 9a/9b are two signs for 9. Both map to one label."""
    if category == "alphabet":
        match = re.fullmatch(r"([A-Za-z])(\d*)", class_folder.strip())
        if match:
            return match.group(1).upper(), match.group(2)
    if category == "numeral":
        match = re.fullmatch(r"(\d)([a-z]?)", class_folder.strip())
        if match:
            return match.group(1), match.group(2)
    return class_folder.strip(), ""


def dhash(gray_image: Image.Image) -> int:
    """64-bit difference hash. Robust to resizing and mild brightness changes."""
    small = gray_image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = np.asarray(small, dtype=np.int16)
    bits = (pixels[:, 1:] > pixels[:, :-1]).flatten()
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def near_duplicate_pairs(hashes: dict[int, int], max_distance: int = DHASH_NEAR_DISTANCE) -> list[tuple[int, int, int]]:
    """Find pairs of images whose hashes differ by at most max_distance bits.

    Works on the distinct hash values first. Many photos share a plain background and so share a hash, and
    comparing every image with every other would be slow. The distinct values are compared in blocks with a
    vectorised XOR and popcount, then expanded back to the images that carry each value.
    """
    if not hashes:
        return []
    ids = list(hashes.keys())
    values = np.array([hashes[file_id] for file_id in ids], dtype=np.uint64)
    unique, inverse = np.unique(values, return_inverse=True)
    members: dict[int, list[int]] = defaultdict(list)
    for file_id, group in zip(ids, inverse):
        members[int(group)].append(file_id)

    pairs: list[tuple[int, int, int]] = []
    block = 1024
    for start in range(0, len(unique), block):
        rows = unique[start:start + block]
        distance = np.bitwise_count(rows[:, None] ^ unique[None, :])
        row_index, column_index = np.nonzero(distance <= max_distance)
        for r, c in zip(row_index, column_index):
            first_group = start + int(r)
            second_group = int(c)
            if second_group < first_group:
                continue
            first_members = members[first_group]
            if second_group == first_group:
                for i, a in enumerate(first_members):
                    for b in first_members[i + 1:]:
                        pairs.append((min(a, b), max(a, b), 0))
                continue
            d = int(distance[r, c])
            for a in first_members:
                for b in members[second_group]:
                    pairs.append((min(a, b), max(a, b), d))
    return pairs


def similar_pair_histogram(hashes: dict[int, int], max_distance: int = DHASH_NEAR_DISTANCE) -> dict[int, int]:
    """Number of image pairs at each Hamming distance 0..max_distance, without listing the pairs.

    Counts come from the distinct hash values and how many images carry each value, so a large
    dataset with many identical hashes is still summarised quickly.
    """
    if not hashes:
        return {d: 0 for d in range(max_distance + 1)}
    values = np.array(list(hashes.values()), dtype=np.uint64)
    unique, counts = np.unique(values, return_counts=True)
    histogram = {d: 0 for d in range(max_distance + 1)}
    histogram[0] = int(sum(int(c) * (int(c) - 1) // 2 for c in counts))
    block = 1024
    for start in range(0, len(unique), block):
        rows = unique[start:start + block]
        distance = np.bitwise_count(rows[:, None] ^ unique[None, :])
        row_index, column_index = np.nonzero((distance <= max_distance) & (distance > 0))
        for r, c in zip(row_index, column_index):
            first = start + int(r)
            if int(c) <= first:
                continue
            histogram[int(distance[r, c])] += int(counts[first]) * int(counts[int(c)])
    return histogram


def ensure_outside(root: Path, out: Path) -> None:
    root_resolved = root.resolve()
    out_resolved = out.resolve()
    if out_resolved == root_resolved or root_resolved in out_resolved.parents:
        raise SystemExit("The output folder must not be inside the dataset folder. The dataset is read-only.")


def scan_rows(root: Path) -> list[dict]:
    rows = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root).parts
        base = {
            "rel_path": path.relative_to(root).as_posix(),
            "filename": path.name,
            "ext": path.suffix.lower(),
            "bytes": path.stat().st_size,
            "depth": len(relative),
        }
        if path.suffix.lower() not in IMAGE_SUFFIXES or len(relative) != 5:
            rows.append({**base, "age_group": relative[0] if relative else "", "sleeve": "", "category": "unexpected",
                         "class_folder": "", "label": "", "variant": "", "is_image": False})
            continue
        age_group, sleeve_folder, category_folder, class_folder = relative[:4]
        category = categorise(category_folder)
        label, variant = label_for(category, class_folder)
        rows.append({
            **base,
            "age_group": age_group,
            "sleeve": "Full Sleeves" if "full" in sleeve_folder.lower() else "Half Sleeves" if "half" in sleeve_folder.lower() else sleeve_folder,
            "category": category,
            "class_folder": class_folder,
            "label": label,
            "variant": variant,
            "is_image": True,
        })
    return rows


def decode_image(path_text: str) -> dict:
    """Open, verify and measure one image. Failures are recorded, never raised."""
    result = {"readable": False, "width": "", "height": "", "mode": "", "sha256": "", "dhash": "",
              "brightness": "", "sharpness": "", "error": ""}
    path = Path(path_text)
    try:
        data = path.read_bytes()
        result["sha256"] = hashlib.sha256(data).hexdigest()
        with Image.open(path) as probe:
            probe.verify()
        with Image.open(path) as image:
            image.load()
            result.update(width=image.width, height=image.height, mode=image.mode)
            gray = image.convert("L")
            result["dhash"] = dhash(gray)
            pixels = np.asarray(gray, dtype=np.float32)
            result["brightness"] = round(float(pixels.mean()), 2)
            if pixels.shape[0] > 2 and pixels.shape[1] > 2:
                laplacian = (4 * pixels[1:-1, 1:-1] - pixels[:-2, 1:-1] - pixels[2:, 1:-1]
                             - pixels[1:-1, :-2] - pixels[1:-1, 2:])
                result["sharpness"] = round(float(laplacian.var()), 2)
        result["readable"] = True
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
        result["error"] = f"{type(error).__name__}: {error}"
    return result


_landmarker = None
_normalize_hand = None


def _init_landmarker(model_path: str) -> None:
    """Runs once per worker process. The feature function comes from the backend, so training and serving match."""
    global _landmarker, _normalize_hand
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

    sys.path.insert(0, str(BACKEND_DIR))
    from app.services.landmark_features import normalize_hand

    _normalize_hand = normalize_hand
    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    _landmarker = HandLandmarker.create_from_options(options)


def detect_landmarks(item: tuple[int, str]) -> dict:
    """Run MediaPipe on one image and build the single-hand feature from the most confident hand."""
    from mediapipe import Image as MpImage
    from mediapipe import ImageFormat

    file_id, path_text = item
    result = {"file_id": file_id, "detected": False, "hand_count": 0, "handedness": "", "score": "",
              "feature_ok": False, "feature": None, "error": ""}
    try:
        with Image.open(path_text) as image:
            rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
        detection = _landmarker.detect(MpImage(image_format=ImageFormat.SRGB, data=rgb))
    except Exception as error:  # MediaPipe or decoding failure: recorded, the image is skipped
        result["error"] = f"{type(error).__name__}: {error}"
        return result

    hands = detection.hand_landmarks or []
    result["hand_count"] = len(hands)
    if not hands:
        return result
    result["detected"] = True
    best_index = max(range(len(hands)), key=lambda i: detection.handedness[i][0].score)
    best = detection.handedness[best_index][0]
    result["handedness"] = best.category_name
    result["score"] = round(float(best.score), 4)
    points = [[point.x, point.y, point.z] for point in hands[best_index]]
    try:
        feature = _normalize_hand(points)
    except ValueError as error:
        result["error"] = str(error)
        return result
    result["feature_ok"] = True
    result["feature"] = feature.astype(np.float32)
    return result


# ---------- stages ----------

def write_csv(path: Path, rows: list[dict], columns: list[str] | None = None) -> None:
    columns = columns or (list(rows[0].keys()) if rows else [])
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def stage_scan(root: Path, out: Path) -> list[dict]:
    rows = scan_rows(root)
    for file_id, row in enumerate(rows):
        row["file_id"] = file_id
    write_csv(out / "scan.csv", rows)
    print(f"scan: {sum(r['is_image'] is True for r in rows)} images, {sum(r['is_image'] is False for r in rows)} other files")
    return rows


def stage_decode(root: Path, out: Path, workers: int) -> None:
    scan = read_csv(out / "scan.csv")
    images = [row for row in scan if row["is_image"] == "True"]
    paths = [str(root / row["rel_path"]) for row in images]
    started = time.time()
    with mp.Pool(workers) as pool:
        decoded = pool.map(decode_image, paths, chunksize=64)
    rows = []
    for row, info in zip(images, decoded):
        rows.append({"file_id": row["file_id"], "rel_path": row["rel_path"], **info})
    write_csv(out / "decode.csv", rows)
    readable = sum(1 for info in decoded if info["readable"])
    print(f"decode: {readable} readable, {len(decoded) - readable} unreadable in {time.time() - started:.0f}s")


def stage_landmarks(root: Path, out: Path, model: Path, workers: int) -> None:
    decode = read_csv(out / "decode.csv")
    readable = [row for row in decode if row["readable"] == "True"]
    items = [(int(row["file_id"]), str(root / row["rel_path"])) for row in readable]
    started = time.time()
    rows, features, feature_ids = [], [], []
    with mp.Pool(workers, initializer=_init_landmarks, initargs=(str(model),)) as pool:
        for index, result in enumerate(pool.imap(detect_landmarks, items, chunksize=32), 1):
            if result["feature_ok"]:
                features.append(result.pop("feature"))
                feature_ids.append(result["file_id"])
            else:
                result.pop("feature")
            rows.append(result)
            if index % 2000 == 0:
                print(f"  landmarks {index}/{len(items)}", flush=True)
    write_csv(out / "landmarks.csv", rows)
    np.savez_compressed(out / "features63.npz", X=np.stack(features) if features else np.zeros((0, 63), np.float32),
                        file_id=np.array(feature_ids, dtype=np.int64))
    print(f"landmarks: {sum(r['feature_ok'] for r in rows)} of {len(items)} readable images gave a 63-value feature "
          f"in {time.time() - started:.0f}s")


def _init_landmarks(model_path: str) -> None:
    _init_landmarker(model_path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, required=True, help="The 'ISL Images' folder of the dataset.")
    parser.add_argument("--out", type=Path, required=True, help="Output folder. Must be outside --root.")
    parser.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL, help="MediaPipe hand_landmarker.task file.")
    parser.add_argument("--workers", type=int, default=max(1, (mp.cpu_count() or 2) - 1))
    args = parser.parse_args(argv)

    ensure_outside(args.root, args.out)
    args.out.mkdir(parents=True, exist_ok=True)
    stages = STAGES if args.stage == "all" else (args.stage,)
    if "scan" in stages:
        stage_scan(args.root, args.out)
    if "decode" in stages:
        stage_decode(args.root, args.out, args.workers)
    if "landmarks" in stages:
        stage_landmarks(args.root, args.out, args.model, args.workers)
    if "report" in stages:
        from report_isl_static import write_report
        write_report(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
