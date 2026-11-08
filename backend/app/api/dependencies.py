from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings
from app.services.camera_service import CameraService
from app.services.recognition_service import StaticRecognizer


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_camera_service(request: Request) -> CameraService:
    return request.app.state.camera_service


def get_recognizer(request: Request) -> StaticRecognizer:
    return request.app.state.recognizer


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
CameraServiceDep = Annotated[CameraService, Depends(get_camera_service)]
RecognizerDep = Annotated[StaticRecognizer, Depends(get_recognizer)]
