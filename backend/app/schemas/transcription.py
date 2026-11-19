from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Only language codes that the Gemini Live transcription documentation lists. Tamil (ta-IN) is not listed, so it is
# not offered until it is verified with real Tamil audio.
SUPPORTED_LANGUAGES = ("auto", "en-IN", "en-US", "en-GB", "hi-IN")
ENCODING = "pcm_s16le"
SAMPLE_RATE = 16000
CHANNELS = 1


class TranscriptionStatusResponse(BaseModel):
    available: bool
    status: Literal["ready", "disabled", "not_configured"]
    message: str
    model: str
    mode: Literal["live"] = "live"
    encoding: Literal["pcm_s16le"] = ENCODING
    sample_rate: int = SAMPLE_RATE
    channels: int = CHANNELS
    languages: list[str] = list(SUPPORTED_LANGUAGES)
    max_frame_bytes: int
    max_session_seconds: int
    max_connection_seconds: int
    max_concurrent_sessions: int


# Browser to backend. Binary frames carry PCM audio. Every text message is one of the models below.
class StartMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Literal["start"]
    encoding: Literal["pcm_s16le"]
    sampleRate: Literal[16000]
    channels: Literal[1]
    language: str = "auto"
    # The first sequence number for this connection. After a reconnect the browser passes the next number, so
    # segment numbers stay unique across connections.
    seqStart: int = Field(default=1, ge=1, le=1_000_000_000)

    @field_validator("language")
    @classmethod
    def language_is_supported(cls, value: str) -> str:
        if value not in SUPPORTED_LANGUAGES:
            raise ValueError("Unsupported language.")
        return value


class ControlMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Literal["pause", "resume", "stop", "ping"]


# Backend to browser. Interim text replaces the previous interim text. Final text is confirmed and is committed once.
class ReadyMessage(BaseModel):
    type: Literal["ready"] = "ready"


class StateMessage(BaseModel):
    type: Literal["state"] = "state"
    state: Literal["listening", "paused"]


class InterimMessage(BaseModel):
    type: Literal["interim"] = "interim"
    seq: int
    text: str


class FinalMessage(BaseModel):
    type: Literal["final"] = "final"
    seq: int
    text: str


class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
    recoverable: bool


class PongMessage(BaseModel):
    type: Literal["pong"] = "pong"


class ClosedMessage(BaseModel):
    type: Literal["closed"] = "closed"
    reason: str = "stopped"
