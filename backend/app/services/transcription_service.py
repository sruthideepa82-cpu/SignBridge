"""Live speech transcription with Gemini, relayed to the browser over a WebSocket.

The browser sends 16 kHz mono 16-bit PCM. This service forwards it to one Gemini Live session at a time and relays
two kinds of text back:

- interim: a changing hypothesis for the utterance being spoken. Each interim replaces the previous one.
- final: confirmed text for a completed utterance. Each final is sent once.

The Gemini API key stays on the server and is only used to open Gemini sessions. Audio and transcript text are never
logged.
"""

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager, suppress
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from fastapi import WebSocket
from google import genai
from google.genai import errors, types
from pydantic import SecretStr, ValidationError
from starlette.websockets import WebSocketDisconnect

from app.core.config import Settings
from app.core.exceptions import TranscriptionUnavailableError
from app.schemas.transcription import (
    ClosedMessage,
    ControlMessage,
    ErrorMessage,
    FinalMessage,
    InterimMessage,
    PongMessage,
    ReadyMessage,
    SAMPLE_RATE,
    StartMessage,
    StateMessage,
    TranscriptionStatusResponse,
)

logger = logging.getLogger(__name__)

API_VERSION = "v1beta"
PCM_MIME_TYPE = f"audio/pcm;rate={SAMPLE_RATE}"
NOT_CONFIGURED_MESSAGE = "GEMINI_API_KEY is missing from backend/.env."
INVALID_START_MESSAGE = "The start message is invalid. Check the encoding, sample rate, channels and language."
COMPLETION_KINDS = ("turn_complete", "generation_complete")
# After audio ends, Gemini only sends more text if speech was still in progress. With no open utterance, this short wait
# is enough. With one open, the runner waits up to the configured drain timeout for its completion marker.
IDLE_FINISH_SECONDS = 1.0
FINISH_POLL_SECONDS = 0.05


@dataclass(frozen=True)
class TranscriptEvent:
    kind: Literal["interim", "final", "segment_end"]
    text: str = ""


@dataclass(frozen=True)
class SessionFailed:
    code: str
    message: str
    recoverable: bool


@dataclass(frozen=True)
class Outbound:
    payload: dict
    last: bool = False


class GeminiTranscriptSession(Protocol):
    async def send_audio(self, pcm: bytes) -> None: ...

    async def end_audio(self) -> None: ...

    def events(self) -> AsyncIterator[TranscriptEvent]: ...


class GeminiTranscriptClient(Protocol):
    def open(self, languages: list[str]) -> AbstractAsyncContextManager[GeminiTranscriptSession]: ...


def parse_server_message(message: Any) -> list[TranscriptEvent]:
    """Turns one Gemini Live message into transcript events, in the order they appear in the message."""
    content = getattr(message, "server_content", None)
    if content is None:
        return []
    events: list[TranscriptEvent] = []
    interim = content.interim_input_transcription
    if interim is not None and interim.text:
        events.append(TranscriptEvent("interim", interim.text))
    final = content.input_transcription
    if final is not None and final.text:
        # The finished flag is not required. The smoke test showed final text arrives with finished=False.
        events.append(TranscriptEvent("final", final.text))
    if any(getattr(content, name, False) for name in COMPLETION_KINDS):
        events.append(TranscriptEvent("segment_end"))
    return events


class TranscriptAccumulator:
    """Turns transcript events into browser messages. Interim text replaces itself. A final is committed once."""

    def __init__(self, first_seq: int = 1) -> None:
        self._next_seq = first_seq
        self._interim: str | None = None
        self._segment_final: str | None = None

    def handle(self, event: TranscriptEvent) -> list[dict]:
        if event.kind == "interim":
            text = event.text.strip()
            if not text or text == self._interim:
                return []
            self._interim = text
            return [InterimMessage(seq=self._next_seq, text=text).model_dump()]

        if event.kind == "final":
            text = event.text.strip()
            # A repeated final inside the same segment is a duplicate. The same words in a later segment are new speech.
            if not text or text == self._segment_final:
                return []
            seq = self._next_seq
            self._next_seq += 1
            self._segment_final = text
            self._interim = None
            return [FinalMessage(seq=seq, text=text).model_dump()]

        messages: list[dict] = []
        if self._interim is not None:
            messages.append(InterimMessage(seq=self._next_seq, text="").model_dump())
        self._interim = None
        self._segment_final = None
        return messages


def map_gemini_error(error: BaseException) -> SessionFailed:
    """Maps a Gemini failure to a safe message. Raw provider text is never sent to the browser."""
    if isinstance(error, TranscriptionUnavailableError):
        return SessionFailed("transcription_unavailable", error.message, False)
    if isinstance(error, errors.APIError):
        code = error.code
        text = str(error).lower()
        if code in (401, 403) or (code == 1007 and "api key" in text):
            return SessionFailed(
                "gemini_auth_failed",
                "Gemini rejected the API key, or this key cannot use live transcription.",
                False,
            )
        if code == 404:
            return SessionFailed("gemini_model_unavailable", "The live transcription model is not available.", False)
        if code == 429:
            return SessionFailed("gemini_rate_limited", "Gemini rate or quota limit reached. Try again shortly.", True)
        if code == 400:
            return SessionFailed("gemini_request_rejected", "Gemini rejected the audio stream.", False)
        if isinstance(code, int) and code >= 500:
            return SessionFailed("gemini_unavailable", "Gemini is temporarily unavailable.", True)
    return SessionFailed("gemini_disconnected", "The connection to Gemini was interrupted.", True)


class GeminiLiveSession:
    """Adapts one google-genai Live session to the GeminiTranscriptSession protocol."""

    def __init__(self, session: Any) -> None:
        self._session = session
        self._ending = False

    async def send_audio(self, pcm: bytes) -> None:
        await self._session.send_realtime_input(audio=types.Blob(data=pcm, mime_type=PCM_MIME_TYPE))

    async def end_audio(self) -> None:
        self._ending = True
        await self._session.send_realtime_input(audio_stream_end=True)

    async def events(self) -> AsyncIterator[TranscriptEvent]:
        while True:
            # receive() returns after each completed response. The session stays open between responses, so the
            # loop continues until audio has ended and its completion marker has arrived.
            async for message in self._session.receive():
                for event in parse_server_message(message):
                    yield event
                    if event.kind == "segment_end" and self._ending:
                        return
            if self._ending:
                return
            await asyncio.sleep(0.01)


class GeminiLiveClient:
    """Opens Gemini Live transcription sessions with the server-side API key."""

    def __init__(self, api_key: SecretStr | None, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._sdk_client: genai.Client | None = None

    @asynccontextmanager
    async def open(self, languages: list[str]) -> AsyncIterator[GeminiLiveSession]:
        if not _has_key(self._api_key):
            raise TranscriptionUnavailableError(NOT_CONFIGURED_MESSAGE)
        if self._sdk_client is None:
            self._sdk_client = genai.Client(
                api_key=self._api_key.get_secret_value(),
                http_options=types.HttpOptions(api_version=API_VERSION),
            )
        config = types.LiveConnectConfig(
            response_modalities=["TEXT"],
            input_audio_transcription=types.AudioTranscriptionConfig(
                language_codes=[] if languages == ["auto"] else languages,
            ),
        )
        async with self._sdk_client.aio.live.connect(model=self._model, config=config) as session:
            yield GeminiLiveSession(session)


class GeminiSessionRunner:
    """One Gemini Live session. Its events and failures go to the connection's output queue."""

    def __init__(
        self,
        client: GeminiTranscriptClient,
        languages: list[str],
        output: asyncio.Queue,
        drain_timeout: float,
        clock: Callable[[], float],
    ) -> None:
        self._client = client
        self._languages = languages
        self._output = output
        self._drain_timeout = drain_timeout
        self._clock = clock
        self._session: GeminiTranscriptSession | None = None
        self._context: AbstractAsyncContextManager[GeminiTranscriptSession] | None = None
        self._pump_task: asyncio.Task | None = None
        self._ended = asyncio.Event()
        self._closing = False
        self._segment_open = False
        self._opened_at = 0.0

    async def start(self) -> None:
        context = self._client.open(self._languages)
        session = await context.__aenter__()
        self._context = context
        self._session = session
        self._opened_at = self._clock()
        self._pump_task = asyncio.create_task(self._pump(session))

    def age(self) -> float:
        return self._clock() - self._opened_at

    async def send_audio(self, pcm: bytes) -> None:
        if self._session is None:
            raise RuntimeError("The Gemini session is not open.")
        await self._session.send_audio(pcm)

    async def finish(self) -> None:
        """Flushes the current utterance, waits for Gemini to confirm it, then closes the session."""
        if self._session is None:
            return
        self._closing = True
        try:
            await self._session.end_audio()
            await self._wait_for_drain()
        except Exception as error:
            await self._output.put(map_gemini_error(error))
        finally:
            await self.abort()

    async def _wait_for_drain(self) -> None:
        loop = asyncio.get_running_loop()
        hard_deadline = loop.time() + self._drain_timeout
        idle_deadline = loop.time() + IDLE_FINISH_SECONDS
        while not self._ended.is_set():
            now = loop.time()
            if now >= hard_deadline:
                logger.warning("Gemini did not confirm the last utterance before the drain timeout.")
                return
            if not self._segment_open and now >= idle_deadline:
                return
            await asyncio.sleep(FINISH_POLL_SECONDS)

    async def abort(self) -> None:
        self._closing = True
        task, self._pump_task = self._pump_task, None
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await task
        context, self._context = self._context, None
        self._session = None
        if context is not None:
            with suppress(Exception):
                await context.__aexit__(None, None, None)

    async def _pump(self, session: GeminiTranscriptSession) -> None:
        try:
            async for event in session.events():
                self._segment_open = event.kind != "segment_end"
                await self._output.put(event)
            if not self._closing:
                await self._output.put(
                    SessionFailed("gemini_session_ended", "The Gemini session ended. Start listening again.", True)
                )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if not self._closing:
                await self._output.put(map_gemini_error(error))
        finally:
            self._ended.set()


class ConcurrencyLimiter:
    def __init__(self, limit: int) -> None:
        self._limit = limit
        self._active = 0

    @property
    def active(self) -> int:
        return self._active

    def acquire(self) -> bool:
        if self._active >= self._limit:
            return False
        self._active += 1
        return True

    def release(self) -> None:
        self._active = max(0, self._active - 1)


class BrowserConnection:
    """Runs one browser WebSocket. A forwarder task sends transcript events. The receive loop handles control messages
    and audio. Everything the browser receives goes through the forwarder, so the order of events is preserved."""

    def __init__(self, service: "TranscriptionService", websocket: WebSocket) -> None:
        self._service = service
        self._settings = service.settings
        self._ws = websocket
        self._output: asyncio.Queue = asyncio.Queue()
        self._state: Literal["idle", "listening", "paused", "stopped"] = "idle"
        self._runner: GeminiSessionRunner | None = None
        self._accumulator = TranscriptAccumulator()
        self._forwarder: asyncio.Task | None = None
        self._receive_task: asyncio.Task | None = None
        self._holds_slot = False
        self._finishing = False
        self._close_code = 1000
        self._languages = ["auto"]
        self._deadline = 0.0

    async def run(self) -> None:
        try:
            await self._serve()
        except WebSocketDisconnect:
            pass
        finally:
            await self._teardown()

    async def _serve(self) -> None:
        if not self._service.is_configured():
            status = self._service.status()
            await self._fail("transcription_unavailable", status.message, False, close_code=1011)
            return
        start = await self._read_start()
        if start is None:
            return
        if not self._service.limiter.acquire():
            await self._fail(
                "too_many_sessions",
                "Too many transcription sessions are open. Stop one and try again.",
                True,
                close_code=1013,
            )
            return
        self._holds_slot = True
        self._accumulator = TranscriptAccumulator(start.seqStart)
        self._languages = [start.language]
        self._deadline = self._service.clock() + self._settings.transcription_max_connection_seconds
        if not await self._open_runner():
            return
        self._state = "listening"
        await self._send(ReadyMessage().model_dump())
        self._forwarder = asyncio.create_task(self._forward())
        await self._loop()

    async def _read_start(self) -> StartMessage | None:
        message = await self._ws.receive()
        if message["type"] == "websocket.disconnect":
            return None
        payload = _parse_object(message.get("text"))
        if payload is None or payload.get("type") != "start":
            await self._fail("invalid_start", "The first message must be a start message.", False, close_code=1008)
            return None
        try:
            return StartMessage.model_validate(payload)
        except ValidationError:
            await self._fail("invalid_start", INVALID_START_MESSAGE, False, close_code=1008)
            return None

    async def _loop(self) -> None:
        assert self._forwarder is not None
        self._receive_task = asyncio.create_task(self._ws.receive())
        while True:
            remaining = self._deadline - self._service.clock()
            if remaining <= 0:
                await self._fail(
                    "session_time_limit",
                    "This transcription connection reached its time limit. Start listening again.",
                    False,
                )
                return
            done, _ = await asyncio.wait(
                {self._receive_task, self._forwarder},
                timeout=remaining,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if self._forwarder in done:
                return
            if self._receive_task not in done:
                continue
            message = self._receive_task.result()
            if message["type"] == "websocket.disconnect":
                return
            self._receive_task = asyncio.create_task(self._ws.receive())
            if not await self._handle(message):
                return

    async def _handle(self, message: dict) -> bool:
        """Returns False when the connection should end."""
        if message.get("bytes") is not None:
            return await self._on_audio(message["bytes"])
        payload = _parse_object(message.get("text"))
        if payload is None:
            return await self._reject("invalid_message", "The message is not valid JSON.")
        if payload.get("type") == "start":
            return await self._reject("invalid_state", "The transcription session has already started.")
        try:
            control = ControlMessage.model_validate(payload)
        except ValidationError:
            return await self._reject("invalid_message", "The message type is not supported.")
        if control.type == "ping":
            await self._send(PongMessage().model_dump())
            return True
        if control.type == "pause":
            return await self._pause()
        if control.type == "resume":
            return await self._resume()
        return await self._stop()

    async def _on_audio(self, data: bytes) -> bool:
        if len(data) > self._settings.transcription_max_frame_bytes:
            await self._fail("frame_too_large", "An audio frame was larger than the allowed size.", False, 1009)
            return False
        if self._state != "listening" or self._runner is None:
            return await self._reject("invalid_state", "Audio is only accepted while listening. Resume first.")
        if len(data) == 0 or len(data) % 2:
            return await self._reject("invalid_audio", "Audio must be 16-bit PCM samples.")
        if self._runner.age() >= self._settings.transcription_gemini_session_seconds:
            # Rotate before Gemini's per-session limit. Audio received during the change waits in the socket buffer.
            await self._finish_runner()
            if not await self._open_runner():
                return False
        assert self._runner is not None
        try:
            await self._runner.send_audio(data)
        except Exception:
            # The runner reports the failure through the output queue, so the connection does not need to.
            logger.info("Audio could not be sent to Gemini; waiting for the session failure report.")
        return True

    async def _pause(self) -> bool:
        if self._state != "listening":
            return await self._reject("invalid_state", "Transcription is not listening.")
        await self._finish_runner()
        self._state = "paused"
        await self._emit(StateMessage(state="paused").model_dump())
        return True

    async def _resume(self) -> bool:
        if self._state != "paused":
            return await self._reject("invalid_state", "Transcription is not paused.")
        if not await self._open_runner():
            return False
        self._state = "listening"
        await self._emit(StateMessage(state="listening").model_dump())
        return True

    async def _stop(self) -> bool:
        if self._state == "listening":
            await self._finish_runner()
        self._state = "stopped"
        self._close_code = 1000
        self._finishing = True
        await self._emit(ClosedMessage().model_dump(), last=True)
        return False

    async def _open_runner(self) -> bool:
        runner = GeminiSessionRunner(
            self._service.client,
            self._languages,
            self._output,
            self._settings.transcription_drain_timeout_seconds,
            self._service.clock,
        )
        try:
            await runner.start()
        except Exception as error:
            failure = map_gemini_error(error)
            await self._fail(failure.code, failure.message, failure.recoverable, close_code=1011)
            return False
        self._runner = runner
        logger.info("Gemini transcription session opened.")
        return True

    async def _finish_runner(self) -> None:
        runner, self._runner = self._runner, None
        if runner is not None:
            await runner.finish()
        logger.info("Gemini transcription session closed.")
        # Gives the browser a segment boundary, so an interim that never received a final is cleared.
        await self._output.put(TranscriptEvent("segment_end"))

    async def _forward(self) -> None:
        while True:
            item = await self._output.get()
            if isinstance(item, SessionFailed):
                self._close_code = 1011
                await self._send(
                    ErrorMessage(code=item.code, message=item.message, recoverable=item.recoverable).model_dump()
                )
                return
            if isinstance(item, Outbound):
                if not await self._send(item.payload) or item.last:
                    return
                continue
            for payload in self._accumulator.handle(item):
                if not await self._send(payload):
                    return

    async def _emit(self, payload: dict, *, last: bool = False) -> None:
        if self._forwarder is None:
            await self._send(payload)
        else:
            await self._output.put(Outbound(payload, last))

    async def _reject(self, code: str, message: str) -> bool:
        await self._emit(ErrorMessage(code=code, message=message, recoverable=True).model_dump())
        return True

    async def _fail(self, code: str, message: str, recoverable: bool, close_code: int = 1000) -> None:
        self._close_code = close_code
        self._finishing = True
        await self._emit(ErrorMessage(code=code, message=message, recoverable=recoverable).model_dump(), last=True)

    async def _send(self, payload: dict) -> bool:
        try:
            await self._ws.send_json(payload)
            return True
        except Exception:
            return False

    async def _teardown(self) -> None:
        await _cancel(self._receive_task)
        if self._forwarder is not None:
            if self._finishing:
                # After a stop or a failure, the forwarder still has to send its last messages.
                await asyncio.wait({self._forwarder}, timeout=2)
            await _cancel(self._forwarder)
        if self._runner is not None:
            await self._runner.abort()
            self._runner = None
        if self._holds_slot:
            self._service.limiter.release()
            self._holds_slot = False
        with suppress(Exception):
            await self._ws.close(code=self._close_code)


class TranscriptionService:
    def __init__(
        self,
        settings: Settings,
        client: GeminiTranscriptClient | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.settings = settings
        self.client: GeminiTranscriptClient = client or GeminiLiveClient(
            settings.gemini_api_key,
            settings.transcription_model,
        )
        self.clock = clock
        self.limiter = ConcurrencyLimiter(settings.transcription_max_concurrent_sessions)

    def is_configured(self) -> bool:
        return self.settings.transcription_enabled and _has_key(self.settings.gemini_api_key)

    def origin_allowed(self, origin: str | None) -> bool:
        return origin is not None and origin in self.settings.cors_origins

    def status(self) -> TranscriptionStatusResponse:
        settings = self.settings
        if not settings.transcription_enabled:
            state, message = "disabled", "Speech transcription is turned off in the backend settings."
        elif not _has_key(settings.gemini_api_key):
            state, message = "not_configured", NOT_CONFIGURED_MESSAGE
        else:
            state = "ready"
            message = "Gemini live transcription is configured. Access is confirmed when a session starts."
        return TranscriptionStatusResponse(
            available=state == "ready",
            status=state,
            message=message,
            model=settings.transcription_model,
            max_frame_bytes=settings.transcription_max_frame_bytes,
            max_session_seconds=settings.transcription_gemini_session_seconds,
            max_connection_seconds=settings.transcription_max_connection_seconds,
            max_concurrent_sessions=settings.transcription_max_concurrent_sessions,
        )

    async def run_connection(self, websocket: WebSocket) -> None:
        await BrowserConnection(self, websocket).run()


def _has_key(key: SecretStr | None) -> bool:
    return key is not None and bool(key.get_secret_value().strip())


def _parse_object(text: str | None) -> dict | None:
    if text is None:
        return None
    try:
        value = json.loads(text)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


async def _cancel(task: asyncio.Task | None) -> None:
    if task is None:
        return
    if not task.done():
        task.cancel()
    with suppress(asyncio.CancelledError, Exception):
        await task
