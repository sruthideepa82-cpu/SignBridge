"""Inspect a phrase dataset given as a local folder or a .zip archive. Read-only: the source is never modified.

Usage (from the repository root, with backend/.venv):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_recognition\\inspect_archive.py "<dataset path>"

Writes archive_inspection.json and archive_inspection.md next to the repository's isl_phrases dataset folder
(ai-engine/dataset/public/isl_phrases/), unless --out-dir is given.

Checks: path exists, phrase classes (one subfolder per class), samples per class, empty folders, corrupt files,
real file format by content (not by extension), exact duplicates (same bytes, same class and across classes),
licence and citation files, and whether the images carry any signer or language metadata.
"""

import argparse
import hashlib
import io
import json
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, UnidentifiedImageError

REPO = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
LICENCE_NAMES = ("licen", "copying", "citation", "readme", "notice", "attribution", "credits", "terms")
MIN_CLASS_SAMPLES = 20


def list_entries(root: Path) -> tuple[list[tuple[str, str]], list[str], str]:
    """Returns ([(parent folder, filename)], [all folders], 'folder' or 'zip'). Parent is '' at the top level."""
    if root.is_file():
        files, folders = [], set()
        with zipfile.ZipFile(root) as archive:
            for info in archive.infolist():
                path = info.filename.rstrip("/")
                if info.is_dir():
                    folders.add(path)
                    continue
                parent, _, name = path.rpartition("/")
                files.append((parent, name))
                if parent:
                    folders.add(parent)
        return files, sorted(folders), "zip"
    files, folders = [], []
    for sub in sorted(root.rglob("*")):
        rel = sub.relative_to(root).as_posix()
        if sub.is_dir():
            folders.append(rel)
        elif sub.is_file():
            parent, _, name = rel.rpartition("/")
            files.append((parent, name))
    return files, folders, "folder"


def read_bytes(root: Path, kind: str, parent: str, name: str) -> bytes:
    member = f"{parent}/{name}" if parent else name
    if kind == "zip":
        with zipfile.ZipFile(root) as archive:
            return archive.read(member)
    return (root / member).read_bytes()


def display_name(parent: str, name: str) -> str:
    return f"{parent}/{name}" if parent else name


def real_format(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"BM"):
        return "bmp"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return "unknown"


def inspect(root: Path) -> dict:
    files, folders, kind = list_entries(root)
    is_image = lambda name: Path(name).suffix.lower() in IMAGE_EXTENSIONS  # noqa: E731
    class_of = lambda parent: parent.split("/")[-1]  # noqa: E731

    images_by_folder = defaultdict(list)
    for parent, name in files:
        if is_image(name):
            images_by_folder[parent].append(name)
    folders_with_children = {p.rsplit("/", 1)[0] for p in folders if "/" in p}
    parents_of_files = {parent for parent, _ in files}
    empty_folders = sorted(
        folder for folder in folders
        if not images_by_folder.get(folder) and folder not in parents_of_files and folder not in folders_with_children
    )
    classes = Counter()
    for parent, names in images_by_folder.items():
        classes[class_of(parent)] += len(names)
    non_image = [display_name(parent, name) for parent, name in files if not is_image(name)]

    corrupt, format_counts, extension_mismatch, sizes = [], Counter(), 0, Counter()
    digests = defaultdict(list)
    archive = zipfile.ZipFile(root) if kind == "zip" else None
    try:
        for parent in sorted(images_by_folder):
            for name in sorted(images_by_folder[parent]):
                member = display_name(parent, name)
                data = archive.read(member) if archive else (root / member).read_bytes()
                fmt = real_format(data)
                format_counts[fmt] += 1
                ext = Path(name).suffix.lower().lstrip(".").replace("jpg", "jpeg")
                if fmt != "unknown" and ext != fmt:
                    extension_mismatch += 1
                try:
                    with Image.open(io.BytesIO(data)) as image:
                        image.verify()
                    with Image.open(io.BytesIO(data)) as image:
                        sizes[f"{image.width}x{image.height}"] += 1
                except (UnidentifiedImageError, OSError, SyntaxError) as error:
                    corrupt.append({"file": member, "error": str(error)})
                    continue
                digests[hashlib.sha256(data).hexdigest()].append(member)
    finally:
        if archive:
            archive.close()

    duplicate_groups = [group for group in digests.values() if len(group) > 1]
    cross_class = [g for g in duplicate_groups if len({class_of(m.rsplit("/", 1)[0]) for m in g}) > 1]
    duplicate_extra = sum(len(g) - 1 for g in duplicate_groups)

    licence_candidates = sorted(
        display_name(parent, name)
        for parent, name in files
        if any(key in name.lower() for key in LICENCE_NAMES)
    )
    signer_hits = sorted(
        display_name(parent, name)
        for parent, name in files
        if any(key in display_name(parent, name).lower() for key in ("signer", "participant", "subject"))
    )
    small = sorted(c for c, n in classes.items() if n < MIN_CLASS_SAMPLES)

    return {
        "source": str(root),
        "source_type": kind,
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "classes": len(classes),
        "images_total": sum(classes.values()),
        "samples_per_class": dict(sorted(classes.items())),
        "classes_below_min_samples": {"threshold": MIN_CLASS_SAMPLES, "classes": small},
        "empty_folders": empty_folders,
        "non_image_files": non_image,
        "corrupt_files": corrupt,
        "real_formats": dict(format_counts),
        "extension_mismatch_files": extension_mismatch,
        "image_sizes": dict(sizes),
        "exact_duplicate_groups": len(duplicate_groups),
        "exact_duplicate_extra_files": duplicate_extra,
        "cross_class_duplicate_groups": len(cross_class),
        "licence_or_citation_candidates": licence_candidates,
        "licence_found": any("licen" in c.lower() or "copying" in c.lower() for c in licence_candidates),
        "signer_metadata_candidates": signer_hits,
        "isl_vs_asl_determinable_from_files": False,
    }


def write_markdown(report: dict, path: Path) -> None:
    lines = [
        "# Phrase dataset inspection",
        "",
        f"- Source: `{report['source']}` ({report['source_type']})",
        f"- Checked: {report['checked_at']}",
        f"- Phrase classes: {report['classes']}, images: {report['images_total']}",
        f"- Real formats: {report['real_formats']} (extension mismatches: {report['extension_mismatch_files']})",
        f"- Image sizes: {report['image_sizes']}",
        f"- Corrupt files: {len(report['corrupt_files'])}",
        f"- Empty folders: {report['empty_folders'] or 'none'}",
        f"- Non-image files: {report['non_image_files'] or 'none'}",
        f"- Exact duplicate groups: {report['exact_duplicate_groups']} ({report['exact_duplicate_extra_files']} extra files), cross-class groups: {report['cross_class_duplicate_groups']}",
        f"- Classes below {MIN_CLASS_SAMPLES} samples: {report['classes_below_min_samples']['classes'] or 'none'}",
        f"- Licence found: {report['licence_found']}. Licence/citation candidates: {report['licence_or_citation_candidates'] or 'none'}",
        f"- Signer metadata candidates: {report['signer_metadata_candidates'] or 'none'}",
        f"- ISL vs ASL determinable from files: {report['isl_vs_asl_determinable_from_files']} (needs signer review)",
        "",
        "## Samples per class",
        "",
        "| Class | Samples |",
        "| --- | ---: |",
    ]
    lines += [f"| {cls} | {n} |" for cls, n in report["samples_per_class"].items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dataset", help="Path to the dataset folder or .zip archive.")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    root = Path(args.dataset.strip().strip('"'))
    if not root.exists():
        print(f"Path does not exist: {root}", file=sys.stderr)
        return 2
    if root.is_dir() and not any(p.is_dir() for p in root.iterdir()):
        archives = [p for p in root.iterdir() if p.is_file() and p.suffix.lower() == ".zip"]
        if len(archives) == 1:
            print(f"The folder holds one archive; inspecting {archives[0].name}")
            root = archives[0]
    if root.is_file() and root.suffix.lower() != ".zip":
        print("A file must be a .zip archive or a folder of phrase folders.", file=sys.stderr)
        return 2
    report = inspect(root)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "archive_inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_markdown(report, args.out_dir / "archive_inspection.md")
    print(json.dumps({k: report[k] for k in ("classes", "images_total", "real_formats", "corrupt_files", "exact_duplicate_groups", "licence_found")}, indent=2))
    print(f"wrote {args.out_dir / 'archive_inspection.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
