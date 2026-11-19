from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from google.genai import errors
from starlette.websockets import WebSocketDisconnect

from app.core.config import Settings
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.transcription_service import TranscriptEvent
from tests.test_transcription_service import (
    TEST_KEY,
    FakeGeminiClient,
    FakeGeminiSession,
    make_settings,
)

ORIGIN = {"origin": "http://localhost:5173"}
LIVE_URL = "/api/transcription/live"
START = {"type": "start", "encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1, "language": "auto"}
PCM_100_MS = b"\x01\x00" * 1600


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def build_client(camera_service: CameraService, settings: Settings, gemini: FakeGeminiClient) -> Iterator[TestClient]:
    app = create_app(settings=settings, camera_service=camera_service, transcription_client=gemini)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def gemini() -> FakeGeminiClient:
    return FakeGeminiClient()


@pytest.fixture
def api(camera_service: CameraService, gemini: FakeGeminiClient) -> Iterator[TestClient]:
    yield from build_client(camera_service, make_settings(), gemini)


@pytest.fixture
def clock(api: TestClient) -> FakeClock:
    fake_clock = FakeClock()
    api.app.state.transcription_service.clock = fake_clock
    return fake_clock


def scripted_session(*events_per_frame: list[TranscriptEvent]) -> FakeGeminiSession:
    """Gemini sends the given events after each audio frame, in order."""

    def on_audio(count: int, _pcm: bytes) -> list[TranscriptEvent]:
        return list(events_per_frame[count - 1]) if count <= len(events_per_frame) else []

    return FakeGeminiSession(on_audio=on_audio)


def session_plans(*plans: tuple[list[TranscriptEvent], ...]) -> Callable[[], FakeGeminiSession]:
    """Each Gemini session the connection opens gets the next plan, so a resumed session can say something new."""
    remaining = list(plans)
    return lambda: scripted_session(*remaining.pop(0))


# HTTP status

def test_status_reports_ready_without_returning_the_key(api: TestClient) -> None:
    response = api.get("/api/transcription/status")

    assert response.status_code == 200
    body = response.json()
    assert body["available"] is True
    assert body["status"] == "ready"
    assert body["model"] == "gemini-3.5-transcribe-live"
    assert body["languages"] == ["auto", "en-IN", "en-US", "en-GB", "hi-IN"]
    assert TEST_KEY not in response.text


def test_status_reports_missing_key(camera_service: CameraService, gemini: FakeGeminiClient) -> None:
    for test_client in build_client(camera_service, make_settings(gemini_api_key=None), gemini):
        response = test_client.get("/api/transcription/status")

    assert response.status_code == 200
    assert response.json()["status"] == "not_configured"
    assert response.json()["available"] is False


def test_status_reports_disabled_transcription(camera_service: CameraService, gemini: FakeGeminiClient) -> None:
    for test_client in build_client(camera_service, make_settings(transcription_enabled=False), gemini):
        response = test_client.get("/api/transcription/status")

    assert response.json()["status"] == "disabled"


# Origin and configuration checks

def test_invalid_origin_is_rejected_before_the_socket_opens(api: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as refused:
        with api.websocket_connect(LIVE_URL, headers={"origin": "https://evil.example"}):
            pass

    assert refused.value.code == 1008


def test_missing_origin_is_rejected(api: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as refused:
        with api.websocket_connect(LIVE_URL):
            pass

    assert refused.value.code == 1008


def test_missing_key_is_reported_on_connect_without_exposing_secrets(
    camera_service: CameraService, gemini: FakeGeminiClient
) -> None:
    for test_client in build_client(camera_service, make_settings(gemini_api_key=None), gemini):
        with test_client.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
            error = ws.receive_json()
            with pytest.raises(WebSocketDisconnect) as closed:
                ws.receive_json()

    assert error["type"] == "error"
    assert error["code"] == "transcription_unavailable"
    assert error["recoverable"] is False
    assert closed.value.code == 1011
    assert gemini.sessions == []


# Connection lifecycle and forwarding

def test_start_returns_ready_and_audio_reaches_gemini(api: TestClient, gemini: FakeGeminiClient) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        assert ws.receive_json() == {"type": "ready"}
        ws.send_bytes(PCM_100_MS)
        ws.send_bytes(PCM_100_MS)
        ws.send_json({"type": "stop"})
        assert ws.receive_json() == {"type": "closed", "reason": "stopped"}

    assert gemini.languages == [["auto"]]
    assert gemini.sessions[0].audio == [PCM_100_MS, PCM_100_MS]


def test_interim_and_final_text_are_forwarded(api: TestClient, gemini: FakeGeminiClient) -> None:
    gemini.session_factory = lambda: scripted_session(
        [TranscriptEvent("interim", "Hel")],
        [TranscriptEvent("interim", "Hello")],
        [TranscriptEvent("final", "Hello, how are you?")],
    )

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json() == {"type": "interim", "seq": 1, "text": "Hel"}
        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json() == {"type": "interim", "seq": 1, "text": "Hello"}
        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json() == {"type": "final", "seq": 1, "text": "Hello, how are you?"}


def test_final_is_forwarded_even_when_gemini_reports_finished_false(
    api: TestClient, gemini: FakeGeminiClient
) -> None:
    gemini.session_factory = lambda: scripted_session([TranscriptEvent("final", "Finished text.")])

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)

        assert ws.receive_json() == {"type": "final", "seq": 1, "text": "Finished text."}


def test_multiple_utterances_in_one_session_keep_their_order(api: TestClient, gemini: FakeGeminiClient) -> None:
    gemini.session_factory = lambda: scripted_session(
        [TranscriptEvent("final", "First."), TranscriptEvent("segment_end")],
        [TranscriptEvent("final", "Second."), TranscriptEvent("segment_end")],
    )

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json() == {"type": "final", "seq": 1, "text": "First."}
        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json() == {"type": "final", "seq": 2, "text": "Second."}
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def test_completion_markers_do_not_produce_errors(api: TestClient, gemini: FakeGeminiClient) -> None:
    gemini.session_factory = lambda: scripted_session([TranscriptEvent("final", "Done."), TranscriptEvent("segment_end")])

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json()["type"] == "final"
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def test_stop_finalizes_the_last_utterance_before_closing(api: TestClient, gemini: FakeGeminiClient) -> None:
    gemini.session_factory = lambda: scripted_session([TranscriptEvent("final", "Last words.")])

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        ws.send_json({"type": "stop"})

        assert ws.receive_json() == {"type": "final", "seq": 1, "text": "Last words."}
        assert ws.receive_json() == {"type": "closed", "reason": "stopped"}
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert closed.value.code == 1000
    assert gemini.sessions[0].ended is True
    assert gemini.open_count == 0


def test_pause_and_resume_keep_numbering_and_open_a_new_gemini_session(
    api: TestClient, gemini: FakeGeminiClient
) -> None:
    gemini.session_factory = session_plans(
        ([TranscriptEvent("final", "Before pause.")],),
        ([TranscriptEvent("final", "After resume.")],),
    )

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json() == {"type": "final", "seq": 1, "text": "Before pause."}

        ws.send_json({"type": "pause"})
        assert ws.receive_json() == {"type": "state", "state": "paused"}
        assert gemini.sessions[0].closed is True

        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json()["code"] == "invalid_state"

        ws.send_json({"type": "resume"})
        assert ws.receive_json() == {"type": "state", "state": "listening"}
        assert len(gemini.sessions) == 2

        ws.send_bytes(PCM_100_MS)
        assert ws.receive_json() == {"type": "final", "seq": 2, "text": "After resume."}
        ws.send_json({"type": "stop"})
        ws.receive_json()

    assert gemini.sessions[1].audio == [PCM_100_MS]
    assert gemini.open_count == 0


def test_pause_is_refused_when_not_listening(api: TestClient) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_json({"type": "resume"})

        assert ws.receive_json()["code"] == "invalid_state"


def test_second_start_message_is_refused(api: TestClient) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_json(START)

        error = ws.receive_json()

    assert error["code"] == "invalid_state"
    assert error["recoverable"] is True


# Validation

@pytest.mark.parametrize(
    "start",
    [
        {**START, "language": "ta-IN"},
        {**START, "sampleRate": 48000},
        {**START, "channels": 2},
        {**START, "encoding": "opus"},
    ],
)
def test_invalid_start_is_rejected(api: TestClient, start: dict) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(start)
        error = ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert error["code"] == "invalid_start"
    assert error["recoverable"] is False
    assert closed.value.code == 1008


def test_first_message_must_be_a_start(api: TestClient, gemini: FakeGeminiClient) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_bytes(PCM_100_MS)
        error = ws.receive_json()

    assert error["code"] == "invalid_start"
    assert gemini.sessions == []


def test_oversized_frame_is_rejected_and_the_socket_closed(api: TestClient) -> None:
    oversized = b"\x00\x00" * 16001

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(oversized)
        error = ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert error["code"] == "frame_too_large"
    assert error["recoverable"] is False
    assert closed.value.code == 1009


def test_odd_length_audio_is_rejected_but_the_connection_stays_open(api: TestClient) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(b"\x00" * 3201)
        error = ws.receive_json()
        ws.send_json({"type": "ping"})
        pong = ws.receive_json()

    assert error["code"] == "invalid_audio"
    assert error["recoverable"] is True
    assert pong == {"type": "pong"}


def test_unknown_and_malformed_messages_are_rejected(api: TestClient) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_text("not json")
        assert ws.receive_json()["code"] == "invalid_message"
        ws.send_json({"type": "explode"})
        assert ws.receive_json()["code"] == "invalid_message"


def test_concurrent_session_limit_refuses_extra_connections(camera_service: CameraService) -> None:
    gemini = FakeGeminiClient()
    settings = make_settings(transcription_max_concurrent_sessions=1)
    for test_client in build_client(camera_service, settings, gemini):
        with test_client.websocket_connect(LIVE_URL, headers=ORIGIN) as first:
            first.send_json(START)
            assert first.receive_json() == {"type": "ready"}

            with test_client.websocket_connect(LIVE_URL, headers=ORIGIN) as second:
                second.send_json(START)
                error = second.receive_json()
                with pytest.raises(WebSocketDisconnect) as closed:
                    second.receive_json()

    assert error["code"] == "too_many_sessions"
    assert error["recoverable"] is True
    assert closed.value.code == 1013
    assert len(gemini.sessions) == 1


# Gemini failures

def test_gemini_rejecting_the_key_is_reported_without_secrets(api: TestClient, gemini: FakeGeminiClient) -> None:
    gemini.open_error = errors.APIError(401, {"error": {"code": 401, "message": f"bad {TEST_KEY}", "status": "X"}})

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        error = ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert error["code"] == "gemini_auth_failed"
    assert error["recoverable"] is False
    assert TEST_KEY not in str(error)
    assert closed.value.code == 1011


def test_gemini_outage_mid_speech_is_reported_as_recoverable(api: TestClient, gemini: FakeGeminiClient) -> None:
    gemini.session_factory = lambda: FakeGeminiSession(
        break_at=1,
        break_error=errors.APIError(503, {"error": {"code": 503, "message": "overloaded", "status": "X"}}),
    )

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        error = ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert error["code"] == "gemini_unavailable"
    assert error["recoverable"] is True
    assert "overloaded" not in error["message"]
    assert closed.value.code == 1011


# Resource cleanup and limits

def test_disconnecting_without_stop_closes_gemini_and_frees_the_slot(
    api: TestClient, gemini: FakeGeminiClient
) -> None:
    service = api.app.state.transcription_service

    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        assert gemini.open_count == 1

    assert gemini.open_count == 0
    assert gemini.sessions[0].closed is True
    assert service.limiter.active == 0


def test_gemini_session_is_rotated_before_its_time_limit(api: TestClient, gemini: FakeGeminiClient, clock: FakeClock) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        ws.send_bytes(PCM_100_MS)
        clock.now += 600
        ws.send_bytes(PCM_100_MS)
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}

    assert len(gemini.sessions) == 2
    assert gemini.sessions[0].ended is True
    assert gemini.sessions[0].audio == [PCM_100_MS]
    assert gemini.sessions[1].audio == [PCM_100_MS]


def test_connection_time_limit_ends_the_session(api: TestClient, gemini: FakeGeminiClient, clock: FakeClock) -> None:
    with api.websocket_connect(LIVE_URL, headers=ORIGIN) as ws:
        ws.send_json(START)
        ws.receive_json()
        clock.now += 1801
        ws.send_json({"type": "ping"})

        assert ws.receive_json() == {"type": "pong"}
        error = ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert error["code"] == "session_time_limit"
    assert error["recoverable"] is False
    assert closed.value.code == 1000
    assert gemini.open_count == 0
