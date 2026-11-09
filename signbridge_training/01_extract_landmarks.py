"""Turn sign videos into hand-landmark sequences.

Expected folder layout (one folder per word/class):
    DATA_ROOT/<word>/<clip>.mp4      (any depth; the class is the FIRST folder under DATA_ROOT)

Signer id (needed for an honest train/test split) is parsed from the filename with
--signer-regex (first capture group). If it doesn't match, the clip's own name is used
(then the split is per clip, which is optimistic: see README).

INCLUDE layout (AI4Bharat):  DATA_ROOT/Category/NN. Word/MVI_XXXX.MOV
    python 01_extract_landmarks.py DATA_ROOT out/landmarks.npz --class-depth 2 --only "Hello,Thanks"

--class-depth N   the folder N levels under DATA_ROOT is the class (default 1)
--only A,B        keep only these classes; the "NN. " number prefix is removed from folder names
"""
import argparse, re, sys, urllib.request
from pathlib import Path
import cv2, numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
             "hand_landmarker/float16/1/hand_landmarker.task")
T = 32  # frames kept per clip (resampled)


def get_model(path="hand_landmarker.task"):
    if not Path(path).exists():
        print("Downloading hand_landmarker.task ...")
        urllib.request.urlretrieve(MODEL_URL, path)
    return path


def clip_to_array(video, landmarker):
    """-> (frames, 2, 21, 3); slot 0 = Left hand, 1 = Right hand; zeros if absent."""
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    out, i = [], 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = landmarker.detect_for_video(img, int(i * 1000 / fps))
        frame = np.zeros((2, 21, 3), np.float32)
        for lms, hd in zip(res.hand_landmarks, res.handedness):
            slot = 0 if hd[0].category_name == "Left" else 1
            frame[slot] = [[p.x, p.y, p.z] for p in lms]
        out.append(frame)
        i += 1
    cap.release()
    return np.stack(out) if out else np.zeros((0, 2, 21, 3), np.float32)


def resample(a, t=T):
    if len(a) == 0:
        return np.zeros((t, 2, 21, 3), np.float32)
    idx = np.linspace(0, len(a) - 1, t).round().astype(int)
    return a[idx]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root"); ap.add_argument("out")
    ap.add_argument("--signer-regex", default=r"(P\d+)")
    ap.add_argument("--class-depth", type=int, default=1,
                    help="which folder level is the word: 1 = DATA_ROOT/<word>/..., "
                         "2 = DATA_ROOT/<category>/<word>/... (INCLUDE layout)")
    ap.add_argument("--only", default="", help="comma-separated words to keep (after number prefix removal)")
    a = ap.parse_args()
    root = Path(a.root)
    opts = vision.HandLandmarkerOptions(
        base_options=mpp.BaseOptions(model_asset_path=get_model()),
        running_mode=vision.RunningMode.VIDEO, num_hands=2)
    keep = {w.strip() for w in a.only.split(",") if w.strip()}
    X, y, g, skipped = [], [], [], 0
    vids = sorted(p for p in root.rglob("*") if p.suffix.lower() in {".mp4", ".mov", ".avi", ".mkv"})
    for n, v in enumerate(vids, 1):
        parts = v.relative_to(root).parts
        if len(parts) <= a.class_depth:
            continue
        label = re.sub(r"^\d+\.\s*", "", parts[a.class_depth - 1]).strip()  # "50. Yellow" -> "Yellow"
        if keep and label not in keep:
            continue
        m = re.search(a.signer_regex, v.stem)
        signer = m.group(1) if m else v.stem
        # fresh landmarker per clip: VIDEO mode needs increasing timestamps
        with vision.HandLandmarker.create_from_options(opts) as lm:
            arr = clip_to_array(v, lm)
        if (arr.reshape(len(arr), -1).any(1).mean() if len(arr) else 0) < 0.3:
            skipped += 1; continue   # hands seen in <30% of frames
        X.append(resample(arr)); y.append(label); g.append(signer)
        if n % 20 == 0: print(f"{n}/{len(vids)}", end="\r")
    if not X:
        sys.exit("No clips with usable hand detection. Check --class-depth, --only and the folder layout.")
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(a.out, X=np.stack(X), y=np.array(y), groups=np.array(g))
    print(f"\nSaved {len(X)} clips, skipped {skipped} (no/poor hand detection), "
          f"{len(set(y))} classes, {len(set(g))} signers")

if __name__ == "__main__":
    main()
