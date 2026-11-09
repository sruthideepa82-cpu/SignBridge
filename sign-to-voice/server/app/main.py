import os
from contextlib import asynccontextmanager

import anthropic
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.interpret import AnthropicInterpreter, Interpreter, LLMUnavailable
from app.model_service import ModelService
from app.schemas import InterpretRequest, InterpretResponse, PredictRequest, PredictResponse, TopItemModel

DEFAULT_MODEL = "claude-haiku-5-5"
REQUEST_TIMEOUT_SECONDS = 15.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model_service = ModelService.from_disk()
    yield


app = FastAPI(title="Sign to Voice server", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
    # Default responses echo the rejected input, which can be a large landmark array or contain
    # non-JSON values such as Infinity. Return only where and why.
    details = [
        {"loc": list(item.get("loc", [])), "msg": str(item.get("msg", "invalid value")), "type": item.get("type", "")}
        for item in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": details})


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


def get_model_service(request: Request) -> ModelService:
    return request.app.state.model_service


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/model")
def model_status(service: ModelService = Depends(get_model_service)) -> dict:
    return {"available": service.available, "detail": service.error, "threshold": service.threshold,
            "caveat": service.caveat}


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


@app.post("/api/predict", response_model=PredictResponse)
def predict(request: PredictRequest, service: ModelService = Depends(get_model_service)) -> PredictResponse:
    result = service.predict(np.asarray(request.landmarks, dtype=np.float32))
    return PredictResponse(
        status=result.status,
        word=result.word,
        confidence=result.confidence,
        top3=[TopItemModel(word=item.word, confidence=item.confidence) for item in result.top3],
        threshold=service.threshold,
        detail=result.detail,
        caveat=result.caveat,
    )
