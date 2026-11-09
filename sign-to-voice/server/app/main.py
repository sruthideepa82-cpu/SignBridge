import os

import anthropic
from fastapi import Depends, FastAPI, HTTPException

from app.interpret import AnthropicInterpreter, Interpreter, LLMUnavailable
from app.schemas import InterpretRequest, InterpretResponse

DEFAULT_MODEL = "claude-haiku-5-5"
REQUEST_TIMEOUT_SECONDS = 15.0

app = FastAPI(title="Sign to Voice interpretation server")


def get_interpreter() -> Interpreter:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail={"code": "llm_not_configured", "message": "Set ANTHROPIC_API_KEY on the server."},
        )
    model = os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
    client = anthropic.Anthropic(api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=1)
    return AnthropicInterpreter(client, model)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/interpret", response_model=InterpretResponse)
def interpret(request: InterpretRequest, interpreter: Interpreter = Depends(get_interpreter)) -> InterpretResponse:
    try:
        sentence = interpreter(request.glosses, request.emotion)
    except LLMUnavailable:
        raise HTTPException(
            status_code=502,
            detail={"code": "llm_failed", "message": "The language model did not return a sentence."},
        )
    return InterpretResponse(sentence=sentence)
