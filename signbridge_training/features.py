"""Shared feature function for training (02_train.py) and serving (sign-to-voice server).

Both must import this file, so the model always sees the same features it was trained on.
Depends only on numpy, so the server does not need MediaPipe or OpenCV.
"""
import numpy as np

WINDOW_FRAMES = 32   # clip length after resampling (01_extract_landmarks.T)
HANDS = 2            # slot 0 = Left, slot 1 = Right
LANDMARKS = 21
COORDS = 3


def features(X):
    """X: (N,T,2,21,3) -> (N,F). Position/size invariant; keeps motion."""
    N, T = X.shape[:2]
    present = np.abs(X).sum((3, 4)) > 0                     # (N,T,2)
    wrist = X[:, :, :, 0, :]                                # (N,T,2,3)
    # hand shape: landmarks relative to own wrist, scaled by wrist->middle-MCP length
    scale = np.linalg.norm(X[:, :, :, 9, :] - wrist, axis=-1, keepdims=True) + 1e-6
    shape = (X - wrist[:, :, :, None, :]) / scale[..., None]
    shape = shape * present[..., None, None]
    # hand trajectory: wrist path relative to its mean position, scaled by mean hand size
    msz = (scale * present[..., None]).sum(1, keepdims=True) / (present.sum(1)[:, None, :, None] + 1e-6)
    cnt = present.sum(1)[:, None, :, None] + 1e-6
    mean_w = (wrist * present[..., None]).sum(1, keepdims=True) / cnt
    traj = (wrist - mean_w) / (msz + 1e-6) * present[..., None]
    vel = np.diff(traj, axis=1, prepend=traj[:, :1])
    # where the hands are relative to each other
    both = present[..., 0] & present[..., 1]
    rel = (wrist[:, :, 0] - wrist[:, :, 1]) / (msz.mean(2) + 1e-6) * both[..., None]
    return np.concatenate([a.reshape(N, -1) for a in (shape, traj, vel, rel)], axis=1).astype(np.float32)
