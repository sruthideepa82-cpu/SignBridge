"""Confirm the GEMINI_API_KEY in backend/.env works. Run from the backend folder:

    python scripts/check_gemini.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODEL = "gemini-3.8-flash"


def main() -> int:
    load_dotenv(BACKEND_DIR / ".env")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY is missing. Add it to backend/.env.")
        return 1

    client = genai.Client(api_key=api_key)
    print("Gemini client initialized successfully!")

    response = client.models.generate_content(
        model=MODEL,
        contents="Reply with the single word: ok",
    )
    print(f"Test call to {MODEL} succeeded: {response.text.strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
