import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import SignBridgeError
from app.services.camera_service import CameraService
from app.services.face_detection_service import create_face_detector_factory
from app.services.video_file_capture import LoopingVideoFile
from app.services.hand_detection_service import create_hand_detector_factory
from app.services.phrase_recognizer import PhraseRecognizer
from app.services.recognition_service import StaticRecognizer
from app.services.dataset_store import DatasetStore
from app.services.sequence_recognizer import SequenceRecognizer

logger = logging.getLogger("signbridge")


def error_payload(code: str, message: str, **extra: object) -> dict:
    return {"error": {"code": code, "message": message, **extra}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(SignBridgeError)
    async def handle_signbridge_error(_: Request, exc: SignBridgeError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.code, exc.message),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(f"http_{exc.status_code}", str(exc.detail)),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_payload(
                "validation_error",
                "The request is invalid.",
                details=jsonable_encoder(exc.errors()),
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_payload("internal_error", "An unexpected server error occurred."),
        )


def create_app(
    settings: Settings | None = None,
    camera_service: CameraService | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level.upper())
    capture_factory = None
    if settings.camera_video_file is not None:
        video_path = settings.camera_video_file
        logger.warning("Camera replaced by video file for development: %s", video_path)
        capture_factory = lambda _index: LoopingVideoFile(video_path)  # noqa: E731
    camera = camera_service or CameraService(
        settings,
        **({"capture_factory": capture_factory} if capture_factory else {}),
        detector_factory=create_hand_detector_factory(settings),
        face_detector_factory=create_face_detector_factory(settings),
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        camera.shutdown()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.camera_service = camera
    app.state.recognizer = StaticRecognizer(settings.recognition_model_path, settings.recognition_threshold)
    app.state.phrase_recognizer = PhraseRecognizer(settings.phrase_model_path, settings.phrase_threshold)
    app.state.dataset_store = DatasetStore(
        settings.dataset_dir,
        settings.dataset_vocabulary_path,
        settings.dataset_min_frames,
        settings.dataset_max_frames,
        settings.ai_engine_dir,
    )
    app.state.sequence_recognizer = SequenceRecognizer(
        settings.sequence_model_dir,
        settings.sequence_threshold,
        code_dir=settings.sequence_code_dir,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
