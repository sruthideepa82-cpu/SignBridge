"""Smoke-test Gemini Live transcription with a real spoken WAV file. Run from the backend folder:

    .venv\\Scripts\\python.exe scripts/check_transcribe_live.py path\\to\\speech.wav

The WAV must be 16-bit PCM, mono, 16000 Hz and contain real spoken words. Silence or generated tones do not
prove that transcription works. GEMINI_API_KEY is read from backend/.env and is never printed.
"""

import asyncio
import os
import sys
import time
import wave
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODEL = "gemini-3.5-transcribe-live"
SAMPLE_RATE = 16000
CHUNK_MS = 100
CHUNK_BYTES = SAMPLE_RATE * CHUNK_MS // 1000 * 2
RECEIVE_TIMEOUT_S = 25


def read_wav(path: Path) -> bytes:
    with wave.open(str(path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != SAMPLE_RATE:
            raise ValueError(
                f"WAV must be mono, 16-bit, {SAMPLE_RATE} Hz. "
                f"Found {wav.getnchannels()} channel(s), {wav.getsampwidth() * 8}-bit, {wav.getframerate()} Hz."
            )
        return wav.readframes(wav.getnframes())


def redact(text: str, secret: str) -> str:
    return text.replace(secret, "<redacted>") if secret else text


async def stream_audio(session, pcm: bytes) -> None:
    for offset in range(0, len(pcm), CHUNK_BYTES):
        await session.send_realtime_input(
            audio=types.Blob(data=pcm[offset : offset + CHUNK_BYTES], mime_type=f"audio/pcm;rate={SAMPLE_RATE}")
        )
        await asyncio.sleep(CHUNK_MS / 1000)
    await session.send_realtime_input(audio_stream_end=True)


async def collect_events(session, sender: asyncio.Task) -> list[tuple[str, str, bool]]:
    events: list[tuple[str, str, bool]] = []
    deadline = time.monotonic() + RECEIVE_TIMEOUT_S
    last_interim = None
    while time.monotonic() < deadline:
        async for message in session.receive():
            content = message.server_content
            if content is None:
                print(f"[status] non-content message: {type(message).__name__}")
                continue
            flags = {
                "turn_complete": content.turn_complete,
                "generation_complete": content.generation_complete,
                "interrupted": content.interrupted,
                "turn_complete_reason": str(content.turn_complete_reason) if content.turn_complete_reason else None,
                "waiting_for_input": content.waiting_for_input,
            }
            active = {key: value for key, value in flags.items() if value}
            if active:
                print(f"[status] {active}")
            if content.interim_input_transcription and content.interim_input_transcription.text:
                text = content.interim_input_transcription.text
                if text != last_interim:
                    print(f"[interim] {text}")
                    last_interim = text
                events.append(("interim", text, False))
            if content.input_transcription and content.input_transcription.text:
                text = content.input_transcription.text
                finished = bool(content.input_transcription.finished)
                print(f"[final]   {text}  (finished={finished})")
                events.append(("final", text, finished))
            if content.turn_complete or content.generation_complete:
                print("[marker] completion signal received")
                if sender.done():
                    return events
        await asyncio.sleep(0.05)
    return events


async def run(api_key: str, wav_path: Path) -> int:
    pcm = read_wav(wav_path)
    seconds = len(pcm) / (SAMPLE_RATE * 2)
    print(f"Model: {MODEL}")
    print(f"Audio: {wav_path.name}, {seconds:.1f} s, streamed in {CHUNK_MS} ms chunks")

    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(api_version="v1beta"))
    config = types.LiveConnectConfig(
        response_modalities=["TEXT"],
        input_audio_transcription=types.AudioTranscriptionConfig(language_codes=[]),
    )

    async with client.aio.live.connect(model=MODEL, config=config) as session:
        print("Connected to the Gemini Live session.")
        sender = asyncio.create_task(stream_audio(session, pcm))
        events = await collect_events(session, sender)
        await sender

    finals = [text for kind, text, _ in events if kind == "final"]
    print()
    if finals:
        print("Transcription result:")
        print(" ".join(finals))
        return 0
    print("No final transcription was received. Check the audio file and the model access on this key.")
    return 2


def main() -> int:
    load_dotenv(BACKEND_DIR / ".env")
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        print("GEMINI_API_KEY is missing. Add it to backend/.env.")
        return 1
    if len(sys.argv) != 2:
        print("Usage: python scripts/check_transcribe_live.py <speech.wav>")
        return 1
    wav_path = Path(sys.argv[1])
    if not wav_path.is_file():
        print(f"WAV file not found: {wav_path}")
        return 1
    try:
        return asyncio.run(run(api_key, wav_path))
    except ValueError as error:
        print(redact(str(error), api_key))
        return 1
    except errors.APIError as error:
        print(f"Gemini API error {error.code}: {redact(str(error.message or error), api_key)}")
        return 1
    except Exception as error:  # noqa: BLE001 - smoke test reports any failure without the key.
        print(f"Unexpected {type(error).__name__}: {redact(str(error), api_key)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
