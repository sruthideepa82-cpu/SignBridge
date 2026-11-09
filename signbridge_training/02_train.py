"""Train + evaluate a sign classifier on landmark sequences.

Usage:  python 02_train.py out/landmarks.npz --out model/
Evaluates on signers the model never saw (GroupShuffleSplit), which is the honest number.
"""
import argparse, json
from pathlib import Path
import numpy as np, joblib
from sklearn.model_selection import GroupShuffleSplit
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from features import features  # shared with the serving code; do not copy it here


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data"); ap.add_argument("--out", default="model")
    ap.add_argument("--test-size", type=float, default=0.25)
    a = ap.parse_args()
    d = np.load(a.data, allow_pickle=True)
    X, y, g = d["X"], d["y"], d["groups"]
    classes = sorted(set(y)); yi = np.array([classes.index(c) for c in y])
    F = features(X)
    n_sign = len(set(g))
    if n_sign < 3:
        print(f"WARNING: only {n_sign} signer ids found -> split is not signer-independent.")
    tr, te = next(GroupShuffleSplit(1, test_size=a.test_size, random_state=0).split(F, yi, g))
    print(f"{len(F)} clips | {len(classes)} classes | {n_sign} signers | train {len(tr)} / test {len(te)}")
    models = {
        "random_forest": RandomForestClassifier(400, n_jobs=-1, random_state=0),
        "mlp": make_pipeline(StandardScaler(), MLPClassifier((256, 128), max_iter=400,
                             early_stopping=True, random_state=0)),
    }
    best, best_acc = None, -1
    for name, m in models.items():
        m.fit(F[tr], yi[tr])
        # predict_proba columns follow m.classes_, which can miss classes absent from the training split
        p = np.zeros((len(te), len(classes)))
        p[:, m.classes_] = m.predict_proba(F[te])
        top1 = accuracy_score(yi[te], p.argmax(1))
        top3 = np.mean([yi[te][i] in np.argsort(-p[i])[:3] for i in range(len(te))])
        print(f"{name:14s} top-1 {top1:.3f}   top-3 {top3:.3f}   (chance {1/len(classes):.3f})")
        if top1 > best_acc: best, best_acc, bp = name, top1, p.argmax(1)
    print(f"\nBest: {best}\n")
    present = sorted(set(yi[te]) | set(bp))
    print(classification_report(yi[te], bp, labels=present,
                                target_names=[classes[i] for i in present], zero_division=0))
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    cm = confusion_matrix(yi[te], bp, labels=range(len(classes)))
    np.savetxt(out / "confusion_matrix.csv", cm, fmt="%d", delimiter=",")
    pairs = sorted(((cm[i, j], classes[i], classes[j]) for i in range(len(classes))
                    for j in range(len(classes)) if i != j), reverse=True)[:5]
    print("Most confused (count, true -> predicted):")
    for c, t, p_ in pairs:
        if c: print(f"  {c}x  {t} -> {p_}")
    joblib.dump(models[best], out / "model.joblib")
    json.dump({"classes": classes, "test_top1": best_acc, "model": best,
               "n_signers": n_sign, "frames": int(X.shape[1])}, open(out / "model_card.json", "w"), indent=2)
    print(f"\nSaved to {out}/")

if __name__ == "__main__":
    main()
