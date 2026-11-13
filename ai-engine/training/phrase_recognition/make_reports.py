"""Write the phrase dataset report, the class distribution chart, the evaluation report and the model card.

Usage (from the repository root, after inspect_dataset.py and train_phrase_classifier.py):
    backend\\.venv\\Scripts\\python.exe ai-engine\\training\\phrase_recognition\\make_reports.py

Every number is read from the saved outputs. Nothing is typed in by hand.
"""

import csv
import json
import sys
from collections import Counter
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
DATASET = REPO / "ai-engine" / "dataset" / "public" / "isl_phrases"
TRAINING = DATASET / "training"
MODELS = REPO / "ai-engine" / "models"
ARCHIVE = "Dataset for everyday phrases and words in Indian sign language/images for phrases.zip"


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def distribution_chart(phrases: list[dict], out: Path) -> None:
    colours = {"STATIC": "#2a9d8f", "DYNAMIC": "#e76f51", "UNDETERMINED": "#8d99ae"}
    ordered = sorted(phrases, key=lambda r: (r["motion_class"], r["phrase"]))
    fig, ax = plt.subplots(figsize=(12, 9))
    ax.barh([r["phrase"] for r in ordered], [int(r["images"]) for r in ordered],
            color=[colours[r["motion_class"]] for r in ordered])
    ax.set_xlabel("Images in folder (40 per phrase)")
    ax.set_title("Phrase dataset: images per phrase, coloured by motion class")
    handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in colours.values()]
    ax.legend(handles, list(colours.keys()), loc="lower right")
    ax.invert_yaxis()
    fig.tight_layout()
    fig.savefig(out, dpi=130)
    plt.close(fig)


def dataset_report(phrases: list[dict], inventory: dict, out: Path) -> None:
    counts = Counter(r["motion_class"] for r in phrases)
    lines = [
        "# Daily phrase dataset: inspection report",
        "",
        "Source archive: `" + ARCHIVE + "` (not modified). Extracted working copy: `ai-engine/dataset/public/isl_phrases/images/`.",
        "",
        "## Licence and citation",
        "- The archive contains only images. **No licence file, README, citation or source URL was found in it.**",
        "- Licence: **unknown**. Do not redistribute the images or the trained model until the licence is confirmed.",
        "- Signer identities: **not provided**. Faces are blurred in the images. Shirt colours suggest several people, but this is not verified.",
        "",
        "## Inventory",
        f"- Images: {inventory['total_images']} across {inventory['phrases']} phrase folders.",
        f"- Images per phrase: " + ", ".join(sorted({str(v) for v in inventory['images_per_phrase'].values()})) + ".",
        f"- Sizes: {', '.join(f'{k} ({v})' for k, v in inventory['sizes'].items())}.",
        f"- Real formats: {', '.join(f'{k} {v}' for k, v in inventory['real_formats'].items())}. "
        f"**{inventory['extension_mismatch_count']} files are JPEG data with a .png extension.** They are decoded by content, not by name.",
        f"- Corrupt or unreadable images: {inventory['corrupt_count']}.",
        f"- Exact duplicate groups: {inventory['exact_duplicate_groups']} ({inventory['exact_duplicate_files']} files). "
        f"Cross-phrase duplicate groups: {inventory['cross_phrase_duplicate_groups']}. All duplicates are repeated frames within one phrase.",
        "",
        "## Phrase labels",
        "The 44 folder names mix single words (for example book, sun, team, file, sick) and short phrases (for example how are you, i need help, good morning). "
        "Their validity as ISL daily-conversation items could not be verified from the archive, so every label needs a signer's review.",
        "Whether the examples follow ISL or ASL handshapes also cannot be confirmed from images alone. The alphabet chart in the repository covers letters only.",
        "",
        "## Frame order and motion",
        "File numbers within a phrase appear to follow the frame sequence: a one-off check on greyscale thumbnails found "
        "neighbouring numbers far more alike than random pairs from the same phrase. The 40 images per phrase are therefore "
        "most likely consecutive frames of one or a few clips. This was not saved as a script output.",
        "A single image cannot show movement, so the motion classes below decide which phrases can be learned from still frames.",
        "",
        "| Motion class | Phrases |",
        "| --- | ---: |",
        f"| STATIC (eligible) | {counts.get('STATIC', 0)} |",
        f"| DYNAMIC (excluded, needs movement) | {counts.get('DYNAMIC', 0)} |",
        f"| UNDETERMINED (too few hand detections) | {counts.get('UNDETERMINED', 0)} |",
        "",
        "Rule (in inspect_dataset.py): STATIC when the wrist moves at most "
        f"{inventory['motion_range_limit']} hand-sizes and the handshape deviates by at most {inventory['shape_change_limit']} (90th percentile). "
        "The handshape limit was set after inspecting this dataset, so it is a data-quality gate and not a validated threshold.",
        "",
        "## Per-phrase inventory",
        "| Phrase | Images | Unique | Frames with a hand | Frames with two hands | Wrist range | Shape p90 | Class |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for r in sorted(phrases, key=lambda r: r["phrase"]):
        lines.append(
            f"| {r['phrase']} | {r['images']} | {r['unique_images']} | {r['frames_with_any_hand']} | {r['frames_with_two_hands']} | "
            f"{r['motion_range'] or '-'} | {r['shape_p90'] or '-'} | {r['motion_class']} |"
        )
    lines += ["", "Full per-image records: `image_inventory.csv`. Per-phrase table: `phrase_inventory.csv`. Machine-readable summary: `inventory_report.json`.", ""]
    lines += ["![Class distribution](class_distribution.png)", ""]
    out.write_text("\n".join(lines), encoding="utf-8")


def evaluation_report(report: dict, per_class: list[dict], out: Path) -> None:
    labels = report["labels"]
    matrix = report["test_confusion_matrix"]
    errors = []
    for i, true in enumerate(labels):
        for j, pred in enumerate(labels):
            if i != j and matrix[i][j]:
                errors.append(f"{true} predicted as {pred}: {matrix[i][j]}")
    lines = [
        "# Daily phrase classifier: evaluation report",
        "",
        "**Experimental, unverified dataset. Not signer-independent. Not clip-independent.**",
        "",
        f"- Model: {report['selected_model']} (selected on validation macro-F1).",
        f"- Feature contract: `{report['contract']}` ({report['feature_count']} values).",
        f"- Classes ({len(labels)}, static phrases only): {', '.join(labels)}.",
        f"- Excluded from training: {len(report['excluded_phrases'])} phrases, all dynamic or undetermined (see DATASET_REPORT.md).",
        f"- Samples after removing exact duplicates: {sum(report['sample_counts_after_dedupe'].values())} "
        f"(train {report['split_sizes']['train']}, validation {report['split_sizes']['val']}, test {report['split_sizes']['test']}).",
        "",
        "## Why these numbers are optimistic",
        "- Each phrase has one clip of about 40 frames, and the split is contiguous blocks of that clip. Frames on either side of each cut are near-identical.",
        "- There are no participant IDs, so signer-independent evaluation is not possible.",
        "- With one clip per phrase, the model may partly rely on background or clothing cues rather than the handshape. This was not tested.",
        "- Treat the test accuracy as a check that the pipeline works, not as an estimate of accuracy for new signers. Live webcam testing is the real check.",
        "",
        "## Validation and training",
        "| Candidate | Train accuracy | Validation accuracy | Validation macro-F1 |",
        "| --- | ---: | ---: | ---: |",
    ]
    for name, metrics in report["candidates_validation"].items():
        lines.append(f"| {name}{' (selected)' if name == report['selected_model'] else ''} | {metrics['train_accuracy']} | {metrics['val_accuracy']} | {metrics['val_macro_f1']} |")
    lines += [
        "",
        f"Final model refit on train + validation. Held-out test: accuracy {report['test_accuracy']}, macro-F1 {report['test_macro_f1']} (scored once).",
        "",
        "## Test-set per-class results",
        "| Phrase | Precision | Recall | F1 | Test support | Train | Validation | All |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in per_class:
        lines.append(
            f"| {r['phrase']} | {r['precision']} | {r['recall']} | {r['f1']} | {r['test_support']} | {r['train_samples']} | {r['val_samples']} | {r['all_samples']} |"
        )
    lines += [
        "",
        "## Confusion matrix (test)",
        "![Confusion matrix](confusion_matrix_test.png)",
        "",
        "## Misclassification analysis",
        ("- " + "\n- ".join(errors)) if errors else "- No test errors.",
        "",
        "Only test frames were scored. Each error is one frame. A larger, multi-signer test set is needed before the errors can be generalised.",
        "",
        "## Data needed next",
        "- Several signers, each performing every phrase, recorded with the same camera setup as Live Studio.",
        "- Clip-level or participant-level splits, so that test frames come from people the model has not seen.",
        "- Signer or interpreter review of every label, plus a decision on the licence.",
        "- Video clips for DYNAMIC phrases. Single frames cannot teach them.",
        "",
    ]
    out.write_text("\n".join(lines), encoding="utf-8")


def model_card(report: dict, out: Path) -> None:
    lines = [
        "# Model card: SignBridge daily-phrase classifier (experimental)",
        "",
        "**Status: EXPERIMENTAL / UNVERIFIED. Research use only. Not a verified ISL translation.**",
        "",
        "## Dataset",
        "- Images: 'Dataset for everyday phrases and words in Indian sign language' (images for phrases.zip). Licence unknown; no citation in the archive. Do not redistribute.",
        "- Only the static phrases listed below are used. Dynamic and undetermined phrases are excluded.",
        "",
        "## Model",
        f"- Bundle: `ai-engine/models/phrase_classifier.joblib`. Separate from the alphabet model (`static_classifier.joblib`), which is unchanged.",
        f"- Type: {report['selected_model']}. Feature contract `{report['contract']}` ({report['feature_count']} values, see backend/app/services/phrase_features.py).",
        f"- Labels: {', '.join(report['labels'])}.",
        "- Excluded from recognition: " + ", ".join(sorted(report["excluded_phrases"])) + ".",
        "",
        "## Evaluation",
        f"- Held-out test accuracy {report['test_accuracy']}, macro-F1 {report['test_macro_f1']}, on contiguous frame blocks of one clip per phrase.",
        "- **Not signer-independent. Not clip-independent.** Expect much lower accuracy on new signers and new recording conditions.",
        "",
        "## Limitations",
        "- Static phrases only. Movement is not modelled.",
        "- Trained on a small number of recordings. Signer identities are unknown.",
        "- Labels and the ISL/ASL question have not been reviewed by a signer or interpreter.",
        "- Confidence is the model's probability, not a calibrated accuracy.",
        "",
    ]
    out.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    phrases = read_csv(DATASET / "phrase_inventory.csv")
    inventory = json.loads((DATASET / "inventory_report.json").read_text(encoding="utf-8"))
    report = json.loads((TRAINING / "training_report.json").read_text(encoding="utf-8"))
    per_class = read_csv(TRAINING / "per_class_test_metrics.csv")

    distribution_chart(phrases, DATASET / "class_distribution.png")
    dataset_report(phrases, inventory, DATASET / "DATASET_REPORT.md")
    evaluation_report(report, per_class, TRAINING / "EVALUATION_REPORT.md")
    model_card(report, MODELS / "PHRASE_MODEL_CARD.md")
    for path in [DATASET / "class_distribution.png", DATASET / "DATASET_REPORT.md", TRAINING / "EVALUATION_REPORT.md", MODELS / "PHRASE_MODEL_CARD.md"]:
        print("wrote", path.relative_to(REPO))


if __name__ == "__main__":
    sys.exit(main())
