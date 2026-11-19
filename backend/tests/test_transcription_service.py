import asyncio
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from google.genai import errors, types
from pydantic import SecretStr, ValidationError

from app.core.config import Settings
from app.core.exceptions import TranscriptionUnavailableError
from app.services.transcription_service import (
    ConcurrencyLimiter,
    GeminiLiveClient,
    GeminiLiveSession,
    GeminiSessionRunner,
    SessionFailed,
    TranscriptAccumulator,
    TranscriptEvent,
    TranscriptionService,
    map_gemini_error,
    parse_server_message,
)

PCM_100_MS = b"\x01\x00" * 1600
TEST_KEY = "test-gemini-key-do-not-use"


def make_settings(**overrides) -> Settings:
    values = {
        "_env_file": None,
        "gemini_api_key": TEST_KEY,
        "cors_origins": ["http://localhost:5173"],
        "transcription_drain_timeout_seconds": 0.5,
    }
    values.update(overrides)
    return Settings(**values)


class FakeGeminiSession:
    """Scripted stand-in for a Gemini Live session. The test decides what Gemini says and when it fails."""

    def __init__(
        self,
        on_audio: Callable[[int, bytes], list[TranscriptEvent]] | None = None,
        silent_end: bool = False,
        marker_delay: float = 0.0,
        break_at: int | None = None,
        break_error: BaseException | None = None,
    ) -> None:
        self.audio: list[bytes] = []
        self.ended = False
        self.closed = False
        self._on_audio = on_audio
        self._silent_end = silent_end
        self._marker_delay = marker_delay
        self._break_at = break_at
        self._break_error = break_error
        self._queue: asyncio.Queue = asyncio.Queue()

    async def send_audio(self, pcm: bytes) -> None:
        self.audio.append(pcm)
        if self._on_audio is not None:
            for event in self._on_audio(len(self.audio), pcm):
                self._queue.put_nowait(event)
        if self._break_at is not None and len(self.audio) == self._break_at:
            self._queue.put_nowait(self._break_error)

    async def end_audio(self) -> None:
        self.ended = True
        if self._silent_end:
            return
        marker = TranscriptEvent("segment_end")
        if self._marker_delay:
            asyncio.get_running_loop().call_later(self._marker_delay, self._queue.put_nowait, marker)
        else:
            self._queue.put_nowait(marker)

    def server_closes_normally(self) -> None:
        self._queue.put_nowait(None)

    async def events(self) -> AsyncIterator[TranscriptEvent]:
        while True:
            item = await self._queue.get()
            if item is None:
                return
            if isinstance(item, BaseException):
                raise item
            yield item
            if item.kind == "segment_end" and self.ended:
                return


class FakeGeminiClient:
    def __init__(self) -> None:
        self.sessions: list[FakeGeminiSession] = []
        self.languages: list[list[str]] = []
        self.open_error: BaseException | None = None
        self.session_factory: Callable[[], FakeGeminiSession] = FakeGeminiSession

    @asynccontextmanager
    async def open(self, languages: list[str]) -> AsyncIterator[FakeGeminiSession]:
        self.languages.append(list(languages))
        if self.open_error is not None:
            raise self.open_error
        session = self.session_factory()
        self.sessions.append(session)
        try:
            yield session
        finally:
            session.closed = True

    @property
    def open_count(self) -> int:
        return sum(1 for session in self.sessions if not session.closed)


def api_error(code: int, message: str) -> errors.APIError:
    return errors.APIError(code, {"error": {"code": code, "message": message, "status": "ERROR"}})


def run(coroutine):
    return asyncio.run(coroutine)


# Configuration

def test_gemini_key_defaults_to_unset() -> None:
    settings = Settings(_env_file=None)

    assert settings.gemini_api_key is None
    assert settings.transcription_model == "gemini-3.5-transcribe-live"


def test_gemini_key_is_read_from_the_existing_env_name(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("GEMINI_API_KEY=key-from-env-file\n", encoding="utf-8")

    settings = Settings(_env_file=env_file)

    assert isinstance(settings.gemini_api_key, SecretStr)
    assert settings.gemini_api_key.get_secret_value() == "key-from-env-file"


def test_gemini_key_is_never_shown_in_repr_or_json() -> None:
    settings = Settings(_env_file=None, gemini_api_key="visible-only-to-server")

    assert "visible-only-to-server" not in repr(settings)
    assert "visible-only-to-server" not in settings.model_dump_json()
    assert "visible-only-to-server" not in str(settings.gemini_api_key)


@pytest.mark.parametrize(
    "overrides",
    [
        {"transcription_gemini_session_seconds": 600},
        {"transcription_max_connection_seconds": 30},
        {"transcription_max_frame_bytes": 100},
        {"transcription_max_concurrent_sessions": 0},
        {"transcription_drain_timeout_seconds": 0.1},
    ],
)
def test_transcription_limits_are_validated(overrides: dict) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)


# Status

def test_status_is_ready_with_a_key_and_never_contains_it() -> None:
    service = TranscriptionService(make_settings(), FakeGeminiClient())

    status = service.status()

    assert status.available is True
    assert status.status == "ready"
    assert TEST_KEY not in status.model_dump_json()


def test_status_reports_missing_key_without_secrets() -> None:
    service = TranscriptionService(make_settings(gemini_api_key=None), FakeGeminiClient())

    status = service.status()

    assert status.available is False
    assert status.status == "not_configured"
    assert "GEMINI_API_KEY" in status.message


def test_status_reports_disabled_transcription() -> None:
    service = TranscriptionService(make_settings(transcription_enabled=False), FakeGeminiClient())

    status = service.status()

    assert status.available is False
    assert status.status == "disabled"


def test_origin_must_match_an_allowed_origin() -> None:
    service = TranscriptionService(make_settings(), FakeGeminiClient())

    assert service.origin_allowed("http://localhost:5173") is True
    assert service.origin_allowed("https://evil.example") is False
    assert service.origin_allowed(None) is False


# Parsing Gemini messages (real google-genai types)

def test_interim_and_final_text_are_parsed() -> None:
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(
            interim_input_transcription=types.Transcription(text="Hel"),
            input_transcription=types.Transcription(text="Hello there", finished=False),
        )
    )

    assert parse_server_message(message) == [
        TranscriptEvent("interim", "Hel"),
        TranscriptEvent("final", "Hello there"),
    ]


def test_final_text_is_accepted_when_finished_is_false() -> None:
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(input_transcription=types.Transcription(text="Done", finished=False))
    )

    assert parse_server_message(message) == [TranscriptEvent("final", "Done")]


def test_completion_marker_follows_the_final_text_in_the_same_message() -> None:
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(
            input_transcription=types.Transcription(text="Done", finished=False),
            generation_complete=True,
        )
    )

    assert parse_server_message(message) == [TranscriptEvent("final", "Done"), TranscriptEvent("segment_end")]


def test_messages_without_transcript_produce_no_events() -> None:
    assert parse_server_message(types.LiveServerMessage(setup_complete=types.LiveServerSetupComplete())) == []
    assert parse_server_message(types.LiveServerMessage(server_content=types.LiveServerContent())) == []


def test_empty_transcript_text_is_ignored() -> None:
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(
            interim_input_transcription=types.Transcription(text=""),
            input_transcription=types.Transcription(text=""),
        )
    )

    assert parse_server_message(message) == []


# Accumulator: interim replaces itself, final commits once

def test_interim_replaces_itself_and_identical_interims_are_not_repeated() -> None:
    accumulator = TranscriptAccumulator()

    first = accumulator.handle(TranscriptEvent("interim", "Hel"))
    repeated = accumulator.handle(TranscriptEvent("interim", "Hel"))
    second = accumulator.handle(TranscriptEvent("interim", "Hello"))

    assert first == [{"type": "interim", "seq": 1, "text": "Hel"}]
    assert repeated == []
    assert second == [{"type": "interim", "seq": 1, "text": "Hello"}]


def test_final_is_committed_once_even_if_repeated() -> None:
    accumulator = TranscriptAccumulator()

    committed = accumulator.handle(TranscriptEvent("final", "Hello, how are you?"))
    duplicate = accumulator.handle(TranscriptEvent("final", "Hello, how are you?"))

    assert committed == [{"type": "final", "seq": 1, "text": "Hello, how are you?"}]
    assert duplicate == []


def test_multiple_utterances_get_increasing_sequence_numbers() -> None:
    accumulator = TranscriptAccumulator()

    messages = []
    for event in [
        TranscriptEvent("final", "First sentence."),
        TranscriptEvent("segment_end"),
        TranscriptEvent("final", "Second sentence."),
        TranscriptEvent("segment_end"),
    ]:
        messages.extend(accumulator.handle(event))

    assert messages == [
        {"type": "final", "seq": 1, "text": "First sentence."},
        {"type": "final", "seq": 2, "text": "Second sentence."},
    ]


def test_the_same_words_in_a_later_segment_are_new_speech() -> None:
    accumulator = TranscriptAccumulator()
    accumulator.handle(TranscriptEvent("final", "Yes."))
    accumulator.handle(TranscriptEvent("segment_end"))

    later = accumulator.handle(TranscriptEvent("final", "Yes."))

    assert later == [{"type": "final", "seq": 2, "text": "Yes."}]


def test_final_clears_the_interim_it_confirms() -> None:
    accumulator = TranscriptAccumulator()
    accumulator.handle(TranscriptEvent("interim", "Hell"))

    committed = accumulator.handle(TranscriptEvent("final", "Hello"))

    assert committed == [{"type": "final", "seq": 1, "text": "Hello"}]
    # The next interim belongs to the next segment, so it is sent again even if the text matches the old one.
    assert accumulator.handle(TranscriptEvent("interim", "Hell")) == [{"type": "interim", "seq": 2, "text": "Hell"}]


def test_segment_end_clears_an_unconfirmed_interim() -> None:
    accumulator = TranscriptAccumulator()
    accumulator.handle(TranscriptEvent("interim", "Unfinished"))

    cleared = accumulator.handle(TranscriptEvent("segment_end"))

    assert cleared == [{"type": "interim", "seq": 1, "text": ""}]


def test_sequence_numbering_can_continue_from_a_previous_connection() -> None:
    accumulator = TranscriptAccumulator(first_seq=7)

    assert accumulator.handle(TranscriptEvent("final", "Continued.")) == [
        {"type": "final", "seq": 7, "text": "Continued."}
    ]


# Gemini error mapping

@pytest.mark.parametrize(
    ("error", "code", "recoverable"),
    [
        (api_error(401, "bad key"), "gemini_auth_failed", False),
        (api_error(403, "no access"), "gemini_auth_failed", False),
        (api_error(1007, "API key not valid. Please pass a valid API key."), "gemini_auth_failed", False),
        (api_error(404, "no model"), "gemini_model_unavailable", False),
        (api_error(429, "quota"), "gemini_rate_limited", True),
        (api_error(400, "bad audio"), "gemini_request_rejected", False),
        (api_error(503, "overloaded"), "gemini_unavailable", True),
        (RuntimeError("socket reset"), "gemini_disconnected", True),
    ],
)
def test_gemini_errors_map_to_safe_messages(error: BaseException, code: str, recoverable: bool) -> None:
    failure = map_gemini_error(error)

    assert failure.code == code
    assert failure.recoverable is recoverable
    assert TEST_KEY not in failure.message
    assert "bad key" not in failure.message
    assert "socket reset" not in failure.message


def test_missing_key_error_keeps_its_message() -> None:
    failure = map_gemini_error(TranscriptionUnavailableError("GEMINI_API_KEY is missing from backend/.env."))

    assert failure.code == "transcription_unavailable"
    assert failure.recoverable is False


# Concurrency limit

def test_concurrency_limiter_allows_up_to_its_limit() -> None:
    limiter = ConcurrencyLimiter(2)

    assert limiter.acquire() is True
    assert limiter.acquire() is True
    assert limiter.acquire() is False
    limiter.release()
    assert limiter.acquire() is True
    assert limiter.active == 2


# Gemini Live adapter (fake google-genai session)

class FakeSdkSession:
    def __init__(self, batches: list[list[types.LiveServerMessage]]) -> None:
        self._batches = batches
        self.receive_calls = 0
        self.sent: list[dict] = []

    async def send_realtime_input(self, **kwargs) -> None:
        self.sent.append(kwargs)

    async def receive(self) -> AsyncIterator[types.LiveServerMessage]:
        self.receive_calls += 1
        if self._batches:
            for message in self._batches.pop(0):
                yield message


def completed_message(text: str) -> types.LiveServerMessage:
    return types.LiveServerMessage(
        server_content=types.LiveServerContent(
            input_transcription=types.Transcription(text=text, finished=False),
            generation_complete=True,
        )
    )


def test_adapter_sends_pcm_with_the_live_audio_mime_type() -> None:
    sdk = FakeSdkSession([])
    session = GeminiLiveSession(sdk)

    run(session.send_audio(PCM_100_MS))

    blob = sdk.sent[0]["audio"]
    assert blob.data == PCM_100_MS
    assert blob.mime_type == "audio/pcm;rate=16000"


def test_adapter_stops_reading_after_the_completion_marker_once_audio_ended() -> None:
    sdk = FakeSdkSession([[completed_message("Stop here.")], [completed_message("Never read.")]])
    session = GeminiLiveSession(sdk)

    async def scenario() -> list[TranscriptEvent]:
        await session.end_audio()
        return [event async for event in session.events()]

    events = run(scenario())

    assert events == [TranscriptEvent("final", "Stop here."), TranscriptEvent("segment_end")]
    assert sdk.receive_calls == 1
    assert sdk.sent[0] == {"audio_stream_end": True}


def test_adapter_keeps_reading_across_utterances_while_live() -> None:
    sdk = FakeSdkSession([[completed_message("First.")], [completed_message("Second.")]])
    session = GeminiLiveSession(sdk)

    async def scenario() -> list[TranscriptEvent]:
        collected = []
        async for event in session.events():
            collected.append(event)
            if len(collected) == 4:
                break
        return collected

    events = run(scenario())

    assert [event.text for event in events if event.kind == "final"] == ["First.", "Second."]
    assert sum(1 for event in events if event.kind == "segment_end") == 2


def test_adapter_without_a_key_raises_a_clear_error() -> None:
    client = GeminiLiveClient(None, "gemini-3.5-transcribe-live")

    async def scenario() -> None:
        async with client.open(["auto"]):
            pass

    with pytest.raises(TranscriptionUnavailableError):
        run(scenario())


# Runner: one Gemini session, its events, and cleanup

def test_runner_forwards_events_in_order_and_closes_after_finish() -> None:
    client = FakeGeminiClient()
    client.session_factory = lambda: FakeGeminiSession(
        on_audio=lambda count, _pcm: [TranscriptEvent("interim", "Hel")] if count == 1 else [TranscriptEvent("final", "Hello")]
    )

    async def scenario() -> tuple[list, bool]:
        output: asyncio.Queue = asyncio.Queue()
        runner = GeminiSessionRunner(client, ["auto"], output, 0.5, lambda: 0.0)
        await runner.start()
        await runner.send_audio(PCM_100_MS)
        await runner.send_audio(PCM_100_MS)
        await runner.finish()
        items = []
        while not output.empty():
            items.append(output.get_nowait())
        return items, client.sessions[0].closed

    items, closed = run(scenario())

    assert items == [TranscriptEvent("interim", "Hel"), TranscriptEvent("final", "Hello"), TranscriptEvent("segment_end")]
    assert closed is True
    assert client.open_count == 0


def test_runner_finish_does_not_hang_when_gemini_never_confirms() -> None:
    client = FakeGeminiClient()
    client.session_factory = lambda: FakeGeminiSession(silent_end=True)

    async def scenario() -> tuple[bool, list]:
        output: asyncio.Queue = asyncio.Queue()
        runner = GeminiSessionRunner(client, ["auto"], output, 0.5, lambda: 0.0)
        await runner.start()
        await asyncio.wait_for(runner.finish(), timeout=5)
        items = []
        while not output.empty():
            items.append(output.get_nowait())
        return client.sessions[0].closed, items

    closed, items = run(scenario())

    assert closed is True
    assert items == []


def test_finish_returns_quickly_when_no_utterance_is_open() -> None:
    client = FakeGeminiClient()
    client.session_factory = lambda: FakeGeminiSession(silent_end=True)

    async def scenario() -> float:
        runner = GeminiSessionRunner(client, ["auto"], asyncio.Queue(), 10.0, lambda: 0.0)
        await runner.start()
        started = time.monotonic()
        await asyncio.wait_for(runner.finish(), timeout=5)
        return time.monotonic() - started

    assert run(scenario()) < 3


def test_finish_waits_for_the_marker_of_an_open_utterance() -> None:
    client = FakeGeminiClient()
    client.session_factory = lambda: FakeGeminiSession(
        on_audio=lambda _count, _pcm: [TranscriptEvent("interim", "Still speaking")],
        marker_delay=1.5,
    )

    async def scenario() -> tuple[float, list]:
        output: asyncio.Queue = asyncio.Queue()
        runner = GeminiSessionRunner(client, ["auto"], output, 10.0, lambda: 0.0)
        await runner.start()
        await runner.send_audio(PCM_100_MS)
        started = time.monotonic()
        await asyncio.wait_for(runner.finish(), timeout=8)
        elapsed = time.monotonic() - started
        items = []
        while not output.empty():
            items.append(output.get_nowait())
        return elapsed, items

    elapsed, items = run(scenario())

    assert elapsed >= 1.3
    assert items == [TranscriptEvent("interim", "Still speaking"), TranscriptEvent("segment_end")]


def test_runner_reports_an_unexpected_connection_loss_once() -> None:
    client = FakeGeminiClient()
    client.session_factory = lambda: FakeGeminiSession(break_at=1, break_error=RuntimeError("network down"))

    async def scenario() -> SessionFailed:
        output: asyncio.Queue = asyncio.Queue()
        runner = GeminiSessionRunner(client, ["auto"], output, 0.5, lambda: 0.0)
        await runner.start()
        await runner.send_audio(PCM_100_MS)
        failure = await asyncio.wait_for(output.get(), timeout=5)
        await runner.abort()
        return failure

    failure = run(scenario())

    assert failure == SessionFailed("gemini_disconnected", failure.message, True)
    assert "network down" not in failure.message


def test_runner_reports_when_gemini_ends_the_session_by_itself() -> None:
    client = FakeGeminiClient()
    client.session_factory = lambda: FakeGeminiSession()

    async def scenario() -> SessionFailed:
        output: asyncio.Queue = asyncio.Queue()
        runner = GeminiSessionRunner(client, ["auto"], output, 0.5, lambda: 0.0)
        await runner.start()
        client.sessions[0].server_closes_normally()
        failure = await asyncio.wait_for(output.get(), timeout=5)
        await runner.abort()
        return failure

    assert run(scenario()).code == "gemini_session_ended"


def test_runner_abort_closes_the_session_without_reporting_a_failure() -> None:
    client = FakeGeminiClient()

    async def scenario() -> tuple[bool, bool]:
        output: asyncio.Queue = asyncio.Queue()
        runner = GeminiSessionRunner(client, ["auto"], output, 0.5, lambda: 0.0)
        await runner.start()
        await runner.abort()
        return client.sessions[0].closed, output.empty()

    closed, no_output = run(scenario())

    assert closed is True
    assert no_output is True


def test_runner_start_failure_is_raised_to_the_caller() -> None:
    client = FakeGeminiClient()
    client.open_error = api_error(401, "bad key")

    async def scenario() -> None:
        runner = GeminiSessionRunner(client, ["auto"], asyncio.Queue(), 0.5, lambda: 0.0)
        await runner.start()

    with pytest.raises(errors.APIError):
        run(scenario())
