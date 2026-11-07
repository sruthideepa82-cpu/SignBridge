from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings
from app.services.camera_service import CameraService


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_camera_service(request: Request) -> CameraService:
    return request.app.state.camera_service


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
CameraServiceDep = Annotated[CameraService, Depends(get_camera_service)]
