"""Training-side import of the daily-phrase feature contract.

The contract lives in backend/app/services/phrase_features.py so that training and the live recognizer call the
same code. See that module for the 131-value layout.
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend"))

from app.services.phrase_features import (  # noqa: E402
    PHRASE_FEATURE_CONTRACT,
    PHRASE_FEATURE_COUNT,
    build_phrase_features,
)

__all__ = ["PHRASE_FEATURE_CONTRACT", "PHRASE_FEATURE_COUNT", "build_phrase_features"]
