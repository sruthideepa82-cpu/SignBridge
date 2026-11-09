import os
from pathlib import Path

# app/ -> server/ -> sign-to-voice/ -> SignBridge/
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ML_CODE_DIR = REPO_ROOT / "signbridge_training"
DEFAULT_CONFIDENCE_THRESHOLD = 0.6


def ml_code_dir() -> Path:
    """Folder with features.py and the training scripts. Serving imports features() from here."""
    return Path(os.environ.get("ML_CODE_DIR", DEFAULT_ML_CODE_DIR))


def model_dir() -> Path:
    """Folder with model.joblib and model_card.json, written by 02_train.py."""
    return Path(os.environ.get("ML_MODEL_DIR", ml_code_dir() / "model"))


def confidence_threshold() -> float:
    return float(os.environ.get("ML_CONFIDENCE_THRESHOLD", DEFAULT_CONFIDENCE_THRESHOLD))
