"""Train the first static ISL alphabet classifier on the public dataset's extracted 63-value features.

The features were built by inspect_isl_static.py with backend normalize_hand(). This script does not recompute them.
It reuses the existing bundle contract read by backend/app/services/recognition_service.py:
    {"model": estimator, "labels": list(model.classes_), "feature_count": 63, "version": 1}
and the same scikit-learn classifiers as signbridge_training/02_train.py (RandomForest and MLP).

Why not ai-engine/training/train_static_classifier.py directly: it reads our own participant recordings, refuses any
class not verified in vocabulary.json, and splits by participant ID. The public dataset has none of those. The
bundle format is what is shared.

Outputs go to --out (a candidate folder). The active model is replaced by a separate, explicit step after checks.
"""

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

APPROVED = ["A", "B", "C", "D", "F", "G", "I", "K", "M", "N", "P", "R", "S", "T", "W", "X"]
EXCLUDED_REVIEW = ["E", "L", "O", "Q", "U", "V"]
EXCLUDED_DYNAMIC = ["H", "J", "Y", "Z"]
PIXEL_CONFIRM_THRESHOLD = 2.0  # mean absolute difference on a 0-255 grey scale, 64x64. Re-encoded copies are ~1.
SPLIT_FOLDS = 7  # test = fold 0 (~14%), validation = fold 1 (~14%), train = the rest (~72%)
SEED = 0
ACTIVE_MODEL_NAME = "static_classifier.joblib"
CITATION = ("Singh A., Singh S.K., Mittal A., Gupta B.B. (2022). Static gestures of Indian Sign Language (ISL) for "
            "English Alphabet, Hindi Vowels and Numerals. Mendeley Data, V1, doi:10.17632/7tsw22y96w.1")
LICENCE_NOTE = ("Listed licence CC BY 4.0, but the dataset description limits use to research only and the page "
                "reserves AI-training rights. Research use only. Do not distribute this model or the data until the "
                "licence is clarified.")


# ---------- data ----------

def load_records(features_path: Path, inventory_path: Path) -> tuple[np.ndarray, list[dict]]:
    """Feature matrix and one record per row, joined to the inventory by file_id."""
    data = np.load(features_path)
    X = data["X"].astype(np.float32)
    file_ids = [str(i) for i in data["file_id"]]
    with inventory_path.open(newline="", encoding="utf-8") as handle:
        inventory = {row["file_id"]: row for row in csv.DictReader(handle)}
    records = []
    for index, file_id in enumerate(file_ids):
        row = inventory[file_id]
        records.append({
            "row": index,
            "file_id": file_id,
            "label": row["label"],
            "rel_path": row["rel_path"],
            "age_group": row["age_group"],
            "sleeve": row["sleeve"],
            "sha256": row["sha256"],
            "dhash": int(row["dhash"]) if row["dhash"] != "" else None,
        })
    return X, records


def apply_exclusions(records: list[dict], root: Path | None, pixel_threshold: float = PIXEL_CONFIRM_THRESHOLD):
    """Removes only samples that are confirmed duplicates with a conflicting label. Returns (kept, log).

    1. Restricts to the approved classes. Every other class is logged, not silently dropped.
    2. Byte-identical files: if the copies disagree on label, all are removed. Same-label copies keep one.
    3. Perceptual-hash matches across labels: a pair is confirmed only if the pixels are almost identical
       (mean absolute difference below pixel_threshold). Confirmed pairs are removed. Hash equality alone is not
       enough, because shared backgrounds produce equal hashes.
    """
    log = []
    kept = []
    for record in records:
        if record["label"] in APPROVED:
            kept.append(record)
        else:
            log.append({"file_id": record["file_id"], "label": record["label"], "rel_path": record["rel_path"],
                        "reason": "class not in the approved training set"})

    by_sha = defaultdict(list)
    for record in kept:
        by_sha[record["sha256"]].append(record)
    drop = set()
    for members in by_sha.values():
        if len(members) < 2:
            continue
        labels = {m["label"] for m in members}
        if len(labels) > 1:
            for m in members:
                drop.add(m["file_id"])
                log.append({"file_id": m["file_id"], "label": m["label"], "rel_path": m["rel_path"],
                            "reason": "byte-identical file with conflicting labels " + "|".join(sorted(labels))})
        else:
            for m in members[1:]:
                drop.add(m["file_id"])
                log.append({"file_id": m["file_id"], "label": m["label"], "rel_path": m["rel_path"],
                            "reason": "byte-identical duplicate of a same-label sample"})

    if root is not None:
        by_hash = defaultdict(list)
        for record in kept:
            if record["file_id"] not in drop and record["dhash"] is not None:
                by_hash[record["dhash"]].append(record)
        for members in by_hash.values():
            if len({m["label"] for m in members}) < 2:
                continue
            pixels = {m["file_id"]: _small_grey(root / m["rel_path"]) for m in members}
            for i, a in enumerate(members):
                for b in members[i + 1:]:
                    if a["label"] == b["label"]:
                        continue
                    difference = float(np.abs(pixels[a["file_id"]] - pixels[b["file_id"]]).mean())
                    if difference < pixel_threshold:
                        for m in (a, b):
                            if m["file_id"] not in drop:
                                drop.add(m["file_id"])
                                log.append({"file_id": m["file_id"], "label": m["label"], "rel_path": m["rel_path"],
                                            "reason": f"pixel-confirmed copy with another label (diff {difference:.2f})"})

    kept = [r for r in kept if r["file_id"] not in drop]
    return kept, log


def _small_grey(path: Path) -> np.ndarray:
    from PIL import Image

    with Image.open(path) as image:
        return np.asarray(image.convert("L").resize((64, 64), Image.Resampling.BILINEAR), dtype=np.float32)


def hash_groups(records: list[dict]) -> np.ndarray:
    """Integer group per record. Records joined by identical perceptual hash, transitively, share a group."""
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    first_for_hash: dict[int, int] = {}
    for index, record in enumerate(records):
        find(index)
        value = record["dhash"]
        if value is None:
            continue
        if value in first_for_hash:
            parent[find(index)] = find(first_for_hash[value])
        else:
            first_for_hash[value] = index
    roots = {}
    return np.array([roots.setdefault(find(i), len(roots)) for i in range(len(records))])


def stratified_group_split(labels: np.ndarray, groups: np.ndarray, seed: int = SEED) -> np.ndarray:
    """'train', 'val' or 'test' for every sample. Groups never straddle splits. Every class must be in every split."""
    from sklearn.model_selection import StratifiedGroupKFold

    assignment = np.full(len(labels), "train", dtype=object)
    folds = StratifiedGroupKFold(n_splits=SPLIT_FOLDS, shuffle=True, random_state=seed)
    for fold, (_, held) in enumerate(folds.split(np.zeros(len(labels)), labels, groups)):
        if fold == 0:
            assignment[held] = "test"
        elif fold == 1:
            assignment[held] = "val"
    for name in ("train", "val", "test"):
        present = set(labels[assignment == name])
        missing = set(labels) - present
        if missing:
            raise ValueError(f"The {name} split has no samples for {sorted(missing)}.")
    return assignment


# ---------- models ----------

def candidate_models(seed: int = SEED) -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.neural_network import MLPClassifier
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    return {
        "random_forest": RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1),
        "mlp": make_pipeline(StandardScaler(), MLPClassifier((256, 128), max_iter=400, early_stopping=True,
                                                             random_state=seed)),
    }


def evaluate(model, X: np.ndarray, y: np.ndarray, labels: list[str]) -> dict:
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

    predicted = model.predict(X)
    return {
        "samples": int(len(y)),
        "accuracy": float(accuracy_score(y, predicted)),
        "macro_f1": float(f1_score(y, predicted, labels=labels, average="macro", zero_division=0)),
        "per_class": classification_report(y, predicted, labels=labels, output_dict=True, zero_division=0),
        "report_text": classification_report(y, predicted, labels=labels, zero_division=0),
        "confusion_matrix": confusion_matrix(y, predicted, labels=labels).tolist(),
    }


def misclassified(model, X: np.ndarray, y: np.ndarray, records: list[dict], labels: list[str]) -> list[dict]:
    probabilities = model.predict_proba(X)
    columns = list(model.classes_)
    rows = []
    for i in np.nonzero(model.predict(X) != y)[0]:
        p = probabilities[i]
        order = np.argsort(-p)[:3]
        predicted = columns[int(order[0])]
        rows.append({
            "rel_path": records[i]["rel_path"],
            "true": y[i],
            "predicted": predicted,
            "confidence": round(float(p[int(order[0])]), 4),
            "probability_of_true": round(float(p[columns.index(y[i])]), 4) if y[i] in columns else 0.0,
            "top3": " | ".join(f"{columns[int(k)]} {p[int(k)]:.3f}" for k in order),
            "age_group": records[i]["age_group"],
            "sleeve": records[i]["sleeve"],
        })
    return rows


def train_candidate(X: np.ndarray, labels_all: np.ndarray, assignment: np.ndarray, seed: int = SEED) -> dict:
    """Trains every candidate on train, picks the best by validation macro-F1, refits it on train+validation,
    and scores the test split once. Returns everything the report needs."""
    classes = sorted(set(labels_all.tolist()))
    train, val, test = assignment == "train", assignment == "val", assignment == "test"
    comparison = {}
    fitted = {}
    for name, model in candidate_models(seed).items():
        model.fit(X[train], labels_all[train])
        fitted[name] = model
        comparison[name] = {
            "train": evaluate(model, X[train], labels_all[train], classes),
            "validation": evaluate(model, X[val], labels_all[val], classes),
        }
    best_name = max(comparison, key=lambda name: comparison[name]["validation"]["macro_f1"])

    final = candidate_models(seed)[best_name]
    trainval = train | val
    final.fit(X[trainval], labels_all[trainval])
    test_metrics = evaluate(final, X[test], labels_all[test], classes)
    return {
        "comparison": comparison,
        "selected": best_name,
        "final_model": final,
        "test": test_metrics,
        "test_mask": test,
        "classes": classes,
        "test_index": np.nonzero(test)[0],
    }


def bundle_for(model, classes: list[str]) -> dict:
    return {
        "model": model,
        "labels": [str(label) for label in model.classes_],
        "feature_count": 63,
        "version": 1,
        "verification": "unverified_dataset",
        "experimental": True,
        "source": "public_dataset",
        "classes": classes,
    }


# ---------- outputs ----------

def write_outputs(out: Path, *, records, log, assignment, comparison_result, labels_all, X, config, root) -> None:
    import joblib
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out.mkdir(parents=True, exist_ok=True)
    classes = comparison_result["classes"]
    test = comparison_result["test"]
    model = comparison_result["final_model"]

    with (out / "exclusions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["file_id", "label", "rel_path", "reason"])
        writer.writeheader()
        writer.writerows(log)

    matrix = np.array(test["confusion_matrix"])
    with (out / "confusion_matrix_test.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["true\\predicted", *classes])
        for name, row in zip(classes, matrix):
            writer.writerow([name, *row.tolist()])
    fig, ax = plt.subplots(figsize=(9, 8))
    image = ax.imshow(matrix, cmap="Blues")
    ax.set_xticks(range(len(classes)), classes)
    ax.set_yticks(range(len(classes)), classes)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title(f"Test confusion matrix (n={test['samples']}, accuracy {test['accuracy']:.3f})")
    for i in range(len(classes)):
        for j in range(len(classes)):
            ax.text(j, i, str(matrix[i, j]), ha="center", va="center", fontsize=7,
                    color="white" if matrix[i, j] > matrix.max() / 2 else "black")
    fig.colorbar(image, ax=ax, fraction=0.046)
    fig.tight_layout()
    fig.savefig(out / "confusion_matrix_test.png", dpi=130)
    plt.close(fig)

    test_index = comparison_result["test_index"]
    test_records = [records[i] for i in test_index]
    errors = misclassified(model, X[test_index], labels_all[test_index], test_records, classes)
    with (out / "test_paths.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["label", "rel_path"])
        for index in comparison_result["test_index"]:
            writer.writerow([records[index]["label"], records[index]["rel_path"]])
    with (out / "split_assignment.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["file_id", "label", "rel_path", "split"])
        for index, record in enumerate(records):
            writer.writerow([record["file_id"], record["label"], record["rel_path"], assignment[index]])
    with (out / "misclassified_test.csv").open("w", newline="", encoding="utf-8") as handle:
        fieldnames = ["rel_path", "true", "predicted", "confidence", "probability_of_true", "top3", "age_group", "sleeve"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(errors)

    confused = Counter((e["true"], e["predicted"]) for e in errors).most_common(10)
    by_age = Counter(e["age_group"] for e in errors)
    by_sleeve = Counter(e["sleeve"] for e in errors)

    bundle = bundle_for(model, classes)
    candidates = out / "candidate"
    candidates.mkdir(exist_ok=True)
    joblib.dump(bundle, candidates / ACTIVE_MODEL_NAME)

    report = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "config": config,
        "citation": CITATION,
        "licence_note": LICENCE_NOTE,
        "classes": classes,
        "excluded_review": EXCLUDED_REVIEW,
        "excluded_dynamic": EXCLUDED_DYNAMIC,
        "exclusions": dict(Counter(item["reason"].split(" (")[0] for item in log)),
        "split_sizes": {name: int((assignment == name).sum()) for name in ("train", "val", "test")},
        "split_class_counts": {
            name: dict(sorted(Counter(labels_all[assignment == name].tolist()).items()))
            for name in ("train", "val", "test")
        },
        "comparison": {
            name: {
                "train_accuracy": round(v["train"]["accuracy"], 4),
                "train_macro_f1": round(v["train"]["macro_f1"], 4),
                "validation_accuracy": round(v["validation"]["accuracy"], 4),
                "validation_macro_f1": round(v["validation"]["macro_f1"], 4),
            }
            for name, v in comparison_result["comparison"].items()
        },
        "selected_model": comparison_result["selected"],
        "test": {
            "samples": test["samples"],
            "accuracy": round(test["accuracy"], 4),
            "macro_f1": round(test["macro_f1"], 4),
            "per_class": {k: {m: round(float(v), 4) for m, v in val.items()}
                          for k, val in test["per_class"].items() if isinstance(val, dict)},
        },
        "misclassified_count": len(errors),
        "most_confused_pairs": [{"true": t, "predicted": p, "count": n} for (t, p), n in confused],
        "errors_by_age_group": dict(by_age),
        "errors_by_sleeve": dict(by_sleeve),
        "signer_independent": False,
        "signer_note": ("Signer identities are not available per image. The split groups images by identical perceptual "
                        "hash, which keeps shared backgrounds together, but cannot stop one person appearing in train "
                        "and test. Results are not signer-independent and will be optimistic."),
    }
    (out / "training_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "training_report.md").write_text(_report_markdown(report, test, comparison_result), encoding="utf-8")
    (out / "candidate" / "model_card.json").write_text(json.dumps(_model_card(report), indent=2), encoding="utf-8")
    (out / "candidate" / "MODEL_CARD.md").write_text(_model_card_markdown(report), encoding="utf-8")


def _model_card(report: dict) -> dict:
    return {
        "name": "SignBridge static ISL alphabet classifier (experimental, public-data)",
        "status": "EXPERIMENTAL / UNVERIFIED. Not validated by a signer. Research use only.",
        "classes": report["classes"],
        "selected_model": report["selected_model"],
        "test_accuracy": report["test"]["accuracy"],
        "test_macro_f1": report["test"]["macro_f1"],
        "dataset_citation": report["citation"],
        "licence_note": report["licence_note"],
        "signer_independent": False,
        "features": "63 values from backend normalize_hand() (one hand, wrist-relative, scaled by wrist-to-middle-knuckle).",
    }


def _model_card_markdown(report: dict) -> str:
    test = report["test"]
    return "\n".join([
        "# Model card: SignBridge static ISL alphabet classifier (experimental)",
        "",
        "**Status: EXPERIMENTAL / UNVERIFIED. Research use only. Not a verified ISL translation.**",
        "",
        "## Dataset",
        f"- {report['citation']}",
        f"- {report['licence_note']}",
        "- Only the approved classes are used. Excluded: " + ", ".join(report["excluded_review"] + report["excluded_dynamic"]) + ".",
        "- No synthetic samples. Every training sample is a real dataset image.",
        "",
        "## Model",
        f"- Selected by validation macro-F1: **{report['selected_model']}** (refit on train + validation).",
        "- Input: 63 values from backend `normalize_hand()` on one hand. Output: letter probabilities.",
        f"- Bundle keys: model, labels, feature_count=63, version=1, verification=unverified_dataset, experimental=true.",
        "",
        "## Evaluation (held-out test, scored once)",
        f"- Samples: {test['samples']:,}. Accuracy: **{test['accuracy']:.3f}**. Macro F1: **{test['macro_f1']:.3f}**.",
        "- **Not signer-independent.** Signer identities are unavailable. Expect optimistic numbers on new people.",
        "- Lighting, backgrounds and framing are those of the dataset photos, not the live webcam.",
        "",
        "## Limitations",
        "- Static frames only. Dynamic letters H, J, Y, Z are excluded; the model cannot represent motion.",
        "- Letters E, L, O, Q, U, V are excluded for detection or review concerns.",
        "- Hands were detected in about three quarters of images; the rest were dropped.",
        "- Not validated on the live webcam. Not validated by a qualified ISL signer.",
        "- Do not present predictions as verified ISL translations.",
    ]) + "\n"


def _report_markdown(report: dict, test: dict, comparison_result: dict) -> str:
    lines = [
        "# Training and evaluation report: static ISL alphabet (public dataset)",
        "",
        "**Experimental. Research use only. Not signer-independent.**",
        "",
        f"- Generated: {report['generated_at']}",
        f"- Classes ({len(report['classes'])}): {', '.join(report['classes'])}",
        f"- Excluded for review: {', '.join(report['excluded_review'])}. Excluded as dynamic: {', '.join(report['excluded_dynamic'])}.",
        "",
        "## Exclusions",
    ]
    for reason, count in sorted(report["exclusions"].items()):
        lines.append(f"- {reason}: {count:,}")
    lines += [
        "",
        "## Split (grouped by identical perceptual hash, stratified by class)",
        f"- Train {report['split_sizes']['train']:,}, validation {report['split_sizes']['val']:,}, test {report['split_sizes']['test']:,}.",
        "",
        "## Model comparison (selected on validation macro-F1)",
        "| Model | Train accuracy | Train macro-F1 | Validation accuracy | Validation macro-F1 |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for name, row in report["comparison"].items():
        marker = " (selected)" if name == report["selected_model"] else ""
        lines.append(f"| {name}{marker} | {row['train_accuracy']:.3f} | {row['train_macro_f1']:.3f} | "
                     f"{row['validation_accuracy']:.3f} | {row['validation_macro_f1']:.3f} |")
    lines += [
        "",
        "## Test-set result (scored once, after refit on train + validation)",
        f"- Accuracy: **{test['accuracy']:.3f}**. Macro F1: **{test['macro_f1']:.3f}**. Samples: {test['samples']:,}.",
        "",
        "```",
        test["report_text"],
        "```",
        "",
        "## Most confused pairs (test)",
    ]
    for pair in report["most_confused_pairs"]:
        lines.append(f"- {pair['true']} predicted as {pair['predicted']}: {pair['count']}")
    lines += [
        "",
        f"Misclassified test samples: {report['misclassified_count']:,} (see misclassified_test.csv).",
        f"Errors by age group: {report['errors_by_age_group']}. By sleeve: {report['errors_by_sleeve']}.",
        "",
        "## Signer independence",
        report["signer_note"],
        "",
        "## Licence",
        report["licence_note"],
    ]
    return "\n".join(lines) + "\n"


# ---------- entry point ----------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset-out", type=Path, required=True, help="Folder with features63.npz and inventory.csv.")
    parser.add_argument("--root", type=Path, required=True, help="The dataset 'ISL Images' folder (read-only).")
    parser.add_argument("--out", type=Path, required=True, help="Training output folder, e.g. ...\\isl_static\\training.")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args(argv)

    X, records = load_records(args.dataset_out / "features63.npz", args.dataset_out / "inventory.csv")
    print(f"Loaded {len(records):,} feature rows.", flush=True)
    kept, log = apply_exclusions(records, args.root)
    keep_rows = np.array([r["row"] for r in kept])
    X = X[keep_rows]
    labels_all = np.array([r["label"] for r in kept])
    for index, record in enumerate(kept):
        record["row"] = index
    print(f"Kept {len(kept):,} samples after exclusions ({len(log):,} logged).", flush=True)

    groups = hash_groups(kept)
    assignment = stratified_group_split(labels_all, groups, args.seed)
    result = train_candidate(X, labels_all, assignment, args.seed)
    config = {"seed": args.seed, "classes": APPROVED, "split_folds": SPLIT_FOLDS,
              "pixel_confirm_threshold": PIXEL_CONFIRM_THRESHOLD, "features": "63 from normalize_hand()"}
    write_outputs(args.out, records=kept, log=log, assignment=assignment, comparison_result=result,
                  labels_all=labels_all, X=X, config=config, root=args.root)
    print(f"Selected {result['selected']}. Test accuracy {result['test']['accuracy']:.3f}, "
          f"macro F1 {result['test']['macro_f1']:.3f}. Candidate written to {args.out / 'candidate'}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
