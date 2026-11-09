"""SMOKE TEST ONLY. Fake landmarks so you can check the scripts run. Never use for real results."""
import numpy as np, sys
rng = np.random.default_rng(0)
C, S, R, T = 8, 6, 6, 32          # classes, signers, reps, frames
base = rng.normal(size=(C, 21, 3)) * .05
path = rng.normal(size=(C, 3)) * .15
X, y, g = [], [], []
for c in range(C):
    for s in range(S):
        for _ in range(R):
            t = np.linspace(0, 1, T)[:, None, None]
            hand = base[c] + rng.normal(size=(21, 3)) * .01
            w = np.array([.5, .5, 0]) + rng.normal(size=3) * .05 + path[c] * t[:, 0]
            f = np.zeros((T, 2, 21, 3), np.float32)
            f[:, 1] = hand + w[:, None, :]
            X.append(f); y.append(f"sign_{c}"); g.append(f"P{s}")
np.savez_compressed(sys.argv[1], X=np.stack(X), y=np.array(y), groups=np.array(g))
print("synthetic written")
