"""Test fixtures. The synthetic model is built from make_synthetic.py into a temporary folder.

It is labelled synthetic in its model_card.json, and the server refuses to load it outside tests.
Nothing here writes to signbridge_training/model/ or any real data folder.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ML_DIR = Path(__file__).resolve().parents[3] / "signbridge_training"
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))


@pytest.fixture(scope="session")
def synthetic_model_dir(tmp_path_factory) -> Path:
    work = tmp_path_factory.mktemp("synthetic")
    data = work / "synthetic.npz"
    model_out = work / "model"

    subprocess.run([sys.executable, str(ML_DIR / "make_synthetic.py"), str(data)], check=True, capture_output=True)
    subprocess.run(
        [sys.executable, str(ML_DIR / "02_train.py"), str(data), "--out", str(model_out)],
        check=True,
        capture_output=True,
        cwd=ML_DIR,
    )

    card_path = model_out / "model_card.json"
    card = json.loads(card_path.read_text(encoding="utf-8"))
    card["synthetic"] = True
    card["data_source"] = "make_synthetic.py (SMOKE TEST ONLY, fake landmarks)"
    card_path.write_text(json.dumps(card, indent=2), encoding="utf-8")
    return model_out


@pytest.fixture
def window() -> np.ndarray:
    """A random 32x2x21x3 landmark window. It is test input, not training data."""
    rng = np.random.default_rng(1)
    return (rng.normal(size=(32, 2, 21, 3)) * 0.05 + 0.5).astype(np.float32)
