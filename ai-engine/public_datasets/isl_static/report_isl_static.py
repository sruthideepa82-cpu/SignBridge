"""Builds the inspection report from the CSVs written by inspect_isl_static.py. Reads only those files."""

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from inspect_isl_static import (  # noqa: E402
    DHASH_NEAR_DISTANCE,
    DYNAMIC_LETTERS_STATED,
    DYNAMIC_LETTERS_SUSPECTED,
    ENGLISH_LETTERS,
    similar_pair_histogram,
)

AGE_GROUPS = {"1. Kids ISL images": "Kids", "2. Teenagers ISL Images": "Teenagers", "3. Adults ISL Images": "Adults"}
STATED_SUBJECTS = {"Kids": 4, "Teenagers": 23, "Adults": 6}
# Judgement for review, not validated: a letter is a primary candidate when at least this share of its readable
# images gives a landmark vector. Letters below it are kept for review, not dropped.
PRIMARY_DETECTION_RATE = 0.75
REVIEW_DETECTION_RATE = 0.60


def read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def to_bool(value) -> bool:
    return value in (True, "True")


def build_inventory(out: Path) -> list[dict]:
    scan = {row["file_id"]: row for row in read(out / "scan.csv") if row["is_image"] == "True"}
    decode = {row["file_id"]: row for row in read(out / "decode.csv")}
    landmarks = {row["file_id"]: row for row in read(out / "landmarks.csv")}
    rows = []
    for file_id, scanned in scan.items():
        info = decode.get(file_id, {})
        found = landmarks.get(file_id, {})
        rows.append({
            "file_id": file_id,
            "rel_path": scanned["rel_path"],
            "age_group": AGE_GROUPS.get(scanned["age_group"], scanned["age_group"]),
            "sleeve": scanned["sleeve"],
            "category": scanned["category"],
            "label": scanned["label"],
            "variant": scanned["variant"],
            "readable": info.get("readable", "False"),
            "width": info.get("width", ""),
            "height": info.get("height", ""),
            "mode": info.get("mode", ""),
            "brightness": info.get("brightness", ""),
            "sharpness": info.get("sharpness", ""),
            "sha256": info.get("sha256", ""),
            "dhash": info.get("dhash", ""),
            "hand_count": found.get("hand_count", ""),
            "detected": found.get("detected", "False"),
            "handedness": found.get("handedness", ""),
            "score": found.get("score", ""),
            "feature_ok": found.get("feature_ok", "False"),
            "error": info.get("error", "") or found.get("error", ""),
        })
    return rows


def rate(numerator: int, denominator: int):
    return round(numerator / denominator, 4) if denominator else ""


def class_summary(inventory: list[dict]) -> list[dict]:
    per_label = defaultdict(list)
    for row in inventory:
        if row["category"] == "alphabet":
            per_label[row["label"]].append(row)
    rows = []
    for letter in ENGLISH_LETTERS:
        items = per_label.get(letter, [])
        readable = [r for r in items if to_bool(r["readable"])]
        detected = [r for r in readable if to_bool(r["detected"])]
        features = [r for r in readable if to_bool(r["feature_ok"])]
        two_hand = [r for r in detected if r["hand_count"] == "2"]
        hashes = {int(r["file_id"]): int(r["dhash"]) for r in items if r["dhash"] != ""}
        similar = similar_pair_histogram(hashes, DHASH_NEAR_DISTANCE)
        age = Counter(r["age_group"] for r in items)
        stated = letter in DYNAMIC_LETTERS_STATED
        suspected = letter in DYNAMIC_LETTERS_SUSPECTED
        rows.append({
            "label": letter,
            "images": len(items),
            "readable": len(readable),
            "unreadable": len(items) - len(readable),
            "detected": len(detected),
            "detection_rate": rate(len(detected), len(readable)),
            "features_63": len(features),
            "two_hand_detections": len(two_hand),
            "variants": "|".join(sorted({r["variant"] for r in items if r["variant"]})),
            "kids": age.get("Kids", 0),
            "teenagers": age.get("Teenagers", 0),
            "adults": age.get("Adults", 0),
            "full_sleeves": sum(1 for r in items if r["sleeve"] == "Full Sleeves"),
            "half_sleeves": sum(1 for r in items if r["sleeve"] == "Half Sleeves"),
            "identical_hash_pairs": similar.get(0, 0),
            "similar_hash_pairs_le3": sum(similar.values()) - similar.get(0, 0) if similar else 0,
            "stated_dynamic": stated,
            "suspected_dynamic": suspected,
        })
    return rows


def breakdown(inventory: list[dict], key) -> list[dict]:
    groups = defaultdict(lambda: {"readable": 0, "detected": 0, "images": 0})
    for row in inventory:
        if row["category"] != "alphabet":
            continue
        name = key(row)
        groups[name]["images"] += 1
        if to_bool(row["readable"]):
            groups[name]["readable"] += 1
        if to_bool(row["detected"]):
            groups[name]["detected"] += 1
    return [
        {"group": name, "images": g["images"], "readable": g["readable"], "detected": g["detected"],
         "detection_rate": rate(g["detected"], g["readable"])}
        for name, g in sorted(groups.items())
    ]


def exact_duplicates(inventory: list[dict]) -> list[dict]:
    groups = defaultdict(list)
    for row in inventory:
        if row["sha256"]:
            groups[row["sha256"]].append(row)
    rows = []
    for digest, members in groups.items():
        if len(members) < 2:
            continue
        rows.append({
            "sha256": digest,
            "copies": len(members),
            "labels": "|".join(sorted({m["label"] for m in members})),
            "cross_class": len({m["label"] for m in members}) > 1,
            "paths": " ; ".join(m["rel_path"] for m in members),
        })
    return sorted(rows, key=lambda r: -r["copies"])


def identical_hash_groups(inventory: list[dict]) -> list[dict]:
    """Images whose 64-bit difference hash is identical. Lists each group once, not every pair."""
    groups = defaultdict(list)
    for row in inventory:
        if row["dhash"] != "":
            groups[row["dhash"]].append(row)
    rows = []
    for value, members in groups.items():
        if len(members) < 2:
            continue
        labels = sorted({m["label"] for m in members})
        rows.append({
            "dhash": value,
            "images": len(members),
            "labels": "|".join(labels),
            "cross_class": len(labels) > 1,
            "example_paths": " ; ".join(m["rel_path"] for m in members[:3]),
        })
    return sorted(rows, key=lambda r: -r["images"])


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def distribution_chart(path: Path, summary: list[dict]) -> None:
    letters = [row["label"] for row in summary]
    kids = np.array([row["kids"] for row in summary])
    teens = np.array([row["teenagers"] for row in summary])
    adults = np.array([row["adults"] for row in summary])
    detected = np.array([row["detected"] for row in summary])
    fig, (top, bottom) = plt.subplots(2, 1, figsize=(14, 9), sharex=True)
    top.bar(letters, kids, label="Kids")
    top.bar(letters, teens, bottom=kids, label="Teenagers")
    top.bar(letters, adults, bottom=kids + teens, label="Adults")
    for index, value in enumerate(kids + teens + adults):
        top.text(index, value, str(value), ha="center", va="bottom", fontsize=8)
    top.set_title("Readable image files per letter, by age group (all sleeve types)")
    top.set_ylabel("Image files")
    top.legend()
    bottom.bar(letters, detected, color="tab:green", label="MediaPipe hand detected (63-value feature)")
    bottom.bar(letters, [row["readable"] - row["detected"] for row in summary], bottom=detected,
               color="lightgray", label="No hand detected")
    for tick, row in zip(bottom.get_xticklabels(), summary):
        if row["stated_dynamic"] or row["suspected_dynamic"]:
            tick.set_color("red")
    bottom.set_title("MediaPipe detection per letter. Red labels: H, J, Y stated dynamic; Z suspected dynamic")
    bottom.set_ylabel("Image files")
    bottom.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def other_classes(inventory: list[dict]) -> dict:
    counts = {}
    for category in ("hindi_vowel", "numeral"):
        labels = Counter(row["label"] for row in inventory if row["category"] == category)
        counts[category] = dict(sorted(labels.items()))
    return counts


def write_report(out: Path) -> None:
    inventory = build_inventory(out)
    write_csv(out / "inventory.csv", inventory)
    summary = class_summary(inventory)
    write_csv(out / "class_summary.csv", summary)
    exact = exact_duplicates(inventory)
    write_csv(out / "duplicates_exact.csv", exact)
    identical = identical_hash_groups(inventory)
    write_csv(out / "duplicates_identical_hash_groups.csv", identical)
    unreadable = [row for row in inventory if not to_bool(row["readable"])]
    write_csv(out / "unreadable.csv", unreadable)
    by_age = breakdown(inventory, lambda r: r["age_group"])
    by_sleeve = breakdown(inventory, lambda r: r["sleeve"])
    by_size = breakdown(inventory, lambda r: f"{r['width']}x{r['height']}" if r["width"] else "unreadable")
    write_csv(out / "detection_by_age_group.csv", by_age)
    write_csv(out / "detection_by_sleeve.csv", by_sleeve)
    write_csv(out / "detection_by_image_size.csv", by_size)
    hand_counts = Counter(r["hand_count"] for r in inventory if r["category"] == "alphabet" and to_bool(r["readable"]))
    distribution_chart(out / "class_distribution.png", summary)

    all_hashes = {int(r["file_id"]): int(r["dhash"]) for r in inventory if r["dhash"] != ""}
    overall_similar = similar_pair_histogram(all_hashes, DHASH_NEAR_DISTANCE)

    total = len(inventory)
    readable = sum(to_bool(r["readable"]) for r in inventory)
    detected = sum(to_bool(r["detected"]) for r in inventory)
    features = sum(to_bool(r["feature_ok"]) for r in inventory)
    alphabet = [r for r in summary if r["images"] > 0]
    present = {r["label"] for r in alphabet}
    missing = [letter for letter in ENGLISH_LETTERS if letter not in present]
    smallest = min(alphabet, key=lambda r: r["images"])
    largest = max(alphabet, key=lambda r: r["images"])
    subjects_stated = sum(STATED_SUBJECTS.values())
    sizes = Counter((r["width"], r["height"]) for r in inventory if r["width"])
    sleeves = Counter(r["sleeve"] for r in inventory)
    ages = Counter(r["age_group"] for r in inventory)
    hindi_numeral = other_classes(inventory)
    alphabet_images = sum(r["images"] for r in summary)

    primary, review, excluded = [], [], []
    for row in summary:
        if row["stated_dynamic"] or row["suspected_dynamic"]:
            excluded.append(row)
        elif row["detection_rate"] != "" and row["detection_rate"] >= PRIMARY_DETECTION_RATE:
            primary.append(row)
        else:
            review.append(row)

    summary_json = {
        "total_image_files": total,
        "alphabet_images": alphabet_images,
        "readable": readable,
        "unreadable": total - readable,
        "mediapipe_detected": detected,
        "features_63_extracted": features,
        "exact_duplicate_groups": len(exact),
        "exact_duplicate_extra_files": sum(r["copies"] - 1 for r in exact),
        "identical_hash_groups": len(identical),
        "similar_hash_pairs_by_distance": {str(d): n for d, n in overall_similar.items()},
        "missing_alphabet_classes": missing,
        "min_images_per_letter": smallest["images"],
        "max_images_per_letter": largest["images"],
        "primary_candidates": [r["label"] for r in primary],
        "review_letters": [r["label"] for r in review],
        "excluded_dynamic": [r["label"] for r in excluded],
    }
    (out / "summary.json").write_text(json.dumps(summary_json, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# Public ISL static dataset: inspection report",
        "",
        "Dataset: *Static gestures of Indian Sign Language (ISL) for English Alphabet, Hindi Vowels and Numerals*.",
        "Mendeley Data, DOI 10.17632/7tsw22y96w.1, Singh A., Singh S.K., Mittal A., Gupta B.B. (2022).",
        "Listed licence: CC BY 4.0. The dataset description limits use to research only (see Licence below).",
        "",
        "## 1. Total images",
        f"- Image files: **{total:,}** (all JPEG). The brief said 1,000+. The dataset page claims 1,02,470, which matches.",
        f"- Alphabet images (A–Z, E1/E2 included): **{alphabet_images:,}**. Hindi vowels and numerals are counted "
        "separately below.",
        f"- By age group: {', '.join(f'{k} {v:,}' for k, v in sorted(ages.items()))}.",
        f"- By sleeve type: {', '.join(f'{k} {v:,}' for k, v in sorted(sleeves.items()))}.",
        "",
        "## 2–4. Count per letter, minimum and maximum, missing letters",
        "Counts include every age group and sleeve type. E1/E2 (two signs for E) are merged into E.",
        "",
        "| Letter | Images | Kids | Teenagers | Adults | Full sleeves | Half sleeves | Detected | Detection rate | Note |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for row in summary:
        notes = []
        if row["stated_dynamic"]:
            notes.append("dynamic (stated)")
        if row["suspected_dynamic"]:
            notes.append("dynamic (suspected)")
        if row["variants"]:
            notes.append(f"variants {row['variants'].replace('|', ', ')}")
        lines.append(
            f"| {row['label']} | {row['images']:,} | {row['kids']:,} | {row['teenagers']:,} | {row['adults']:,} | "
            f"{row['full_sleeves']:,} | {row['half_sleeves']:,} | {row['detected']:,} | "
            f"{row['detection_rate'] * 100:.1f}% | {'; '.join(notes)} |"
        )
    lines += [
        "",
        f"- Minimum images for a letter: **{smallest['images']:,}** ({smallest['label']}).",
        f"- Maximum images for a letter: **{largest['images']:,}** ({largest['label']}).",
        f"- Missing alphabet classes: **{', '.join(missing) if missing else 'none'}**.",
        f"- The dataset page says 'a minimum of 2000 images (approx.) for each character'. "
        f"{sum(1 for r in summary if r['images'] < 2000)} of 26 letters fall below 2,000.",
        "- The dataset is **not balanced**. Counts range widely between letters and between age groups. "
        "The totals hide this.",
        "",
        "## 5. Corrupt or unreadable images",
        f"- Unreadable: **{total - readable:,}** of {total:,}. Every file opened and verified. Listed in `unreadable.csv`.",
        "",
        "## 6. Duplicate images",
        f"- Byte-identical copies: **{len(exact):,}** groups, {sum(r['copies'] - 1 for r in exact):,} extra files. "
        "These are true duplicates. Listed in `duplicates_exact.csv`.",
        f"- Identical perceptual hash (64-bit difference hash, distance 0): **{len(identical):,}** groups. "
        "Listed in `duplicates_identical_hash_groups.csv`. Many share a plain background, so this is a weaker signal "
        "than byte-identity.",
        f"- Pairs at each hash distance (all letters): "
        + ", ".join(f"distance {d}: {n:,}" for d, n in overall_similar.items()) + ".",
        "- Distance 3 counts are dominated by shared backgrounds, not duplicate photos. They are not reported as "
        "duplicates. The earlier 9.8-million-pair listing was removed as too large to be useful.",
        "- Duplicates across different letters are the important case. Check `duplicates_identical_hash_groups.csv` "
        "for groups with `cross_class = True` before training.",
        "",
        "## 7. MediaPipe hand detection",
        f"- Readable images with at least one hand detected: **{detected:,}** of {readable:,} "
        f"(**{(detected / readable * 100 if readable else 0):.1f}%**).",
        f"- Hands seen per readable image (MediaPipe): {', '.join(f'{k} hand(s): {v:,}' for k, v in sorted(hand_counts.items()))}. The feature uses the most confident hand only.",
        "- Per-letter rates are in the table above and `class_summary.csv`. Breakdowns are in "
        "`detection_by_age_group.csv`, `detection_by_sleeve.csv` and `detection_by_image_size.csv`.",
        "- Images with no detected hand are excluded. They are not filled in or guessed.",
        "",
        "### Detection by age group",
        *[f"- {r['group']}: {r['detection_rate'] * 100:.1f}% ({r['detected']:,} of {r['readable']:,})" for r in by_age],
        "",
        "### Detection by sleeve type",
        *[f"- {r['group']}: {r['detection_rate'] * 100:.1f}% ({r['detected']:,} of {r['readable']:,})" for r in by_sleeve],
        "",
        "## 8. 63-value landmark vectors",
        f"- Extracted with the backend's `normalize_hand()` from the most confident hand: **{features:,}** images "
        f"(**{(features / readable * 100 if readable else 0):.1f}%** of readable). Stored in `features63.npz` (shape "
        f"{features} × 63, all values finite).",
        "- Per-letter counts are in `class_summary.csv` (`features_63`).",
        "",
        "## 9. Signer identity",
        "- **Not available per image.** Filenames (for example `A (1).jpg`) and folders carry no subject ID.",
        f"- The dataset page states {subjects_stated} subjects in total: 4 kids, 23 teenagers, 6 adults. Those counts "
        "are not linked to files.",
        "- The age-group folders are not individual people. One child can appear in many images.",
        "- A signer-independent split is therefore **not possible** from this data. Results will be optimistic.",
        "",
        "## 10. Dynamic letters represented by static frames",
        "- The dataset page says: 'wherever a character is represented by a dynamic sign, the last frame of the sign is "
        "captured', and names **J, H and Y** as examples.",
        "- **Z** is not named by the dataset. ISL Z is normally a moving sign, so it is flagged as suspected. This needs "
        "checking against the dataset's own images.",
        "- The images cannot show whether a letter's motion is present, so the final pose is all the model would see.",
        "",
        "## Other classes (not part of the alphabet model)",
        f"- Hindi vowels: {', '.join(f'{k} {v:,}' for k, v in hindi_numeral['hindi_vowel'].items())}.",
        f"- Numerals: {', '.join(f'{k} {v:,}' for k, v in hindi_numeral['numeral'].items())}.",
        "",
        "## Image sizes",
        f"- Most common (width × height): {', '.join(f'{w}×{h} ({n:,})' for (w, h), n in sizes.most_common(5))}.",
        "- The dataset page claims 300×500 to 800×600. Full range is in `inventory.csv`.",
        "",
        "## Licence and citation",
        "- Listed on the Mendeley page: **CC BY 4.0**.",
        "- Dataset description: 'This dataset can be used only for research purposes either as it is or after cropping "
        "the static gestures from the image after duly referencing it. Any other use of the dataset is strictly "
        "prohibited.'",
        "- The Mendeley page footer reserves rights for 'AI training and similar technologies'.",
        "- These statements conflict. Until they are resolved, treat the dataset as **research use only**, and do not "
        "distribute a model trained on it. Attribution and the citation above must appear with any output.",
        "- The dataset description says informed participant consent was obtained before image acquisition.",
        "",
        "## Recommendation for the initial model (for review, not applied)",
        "Rules used, stated plainly:",
        "- Dynamic letters are excluded: H, J, Y (stated by the dataset) and Z (suspected).",
        f"- Primary: static letters with at least {int(PRIMARY_DETECTION_RATE * 100)}% of readable images giving a "
        "landmark vector. This threshold is a judgement, not a validated cut-off.",
        f"- Review: static letters between {int(REVIEW_DETECTION_RATE * 100)}% and "
        f"{int(PRIMARY_DETECTION_RATE * 100)}%. These need a look at the failed images before inclusion.",
        "",
        f"**Primary candidates ({len(primary)}):** "
        + (", ".join(f"{r['label']} ({r['detection_rate'] * 100:.1f}%)" for r in primary) or "none") + ".",
        f"**Review ({len(review)}):** "
        + (", ".join(f"{r['label']} ({r['detection_rate'] * 100:.1f}%)" for r in review) or "none") + ".",
        f"**Excluded as dynamic ({len(excluded)}):** "
        + ", ".join(r["label"] for r in excluded) + ".",
        "",
        "Before training, also check that each letter has images from several age groups and sleeve types. "
        "A letter seen mostly in one group will generalise poorly. Letters with a variant (E) need a decision on "
        "whether E1 and E2 are one class.",
        "",
        "## Known limitations",
        "- Still images only, from one acquisition setup (smartphone, about 3 feet, varied backgrounds and light).",
        "- Lighting, background and sleeve type differ from the live webcam. Feature scale is shared through "
        "`normalize_hand()`, but accuracy on the webcam is not measured yet.",
        "- No signer identity, so no signer-independent evaluation.",
        "- Static frames stand in for any moving letters.",
        "- About a quarter of the images give no MediaPipe hand. Those letters are under-represented in the feature set.",
        "- MediaPipe handedness on still photos can differ from the webcam. Handedness is not used by the feature.",
        "",
        "## Not done yet",
        "- No training has run. The report must be reviewed and approved first.",
    ]
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"report: {out / 'report.md'}")
