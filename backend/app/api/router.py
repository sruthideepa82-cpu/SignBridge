from fastapi import APIRouter

from app.api import camera, dataset, face, health, phrase, recognition

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(camera.router)
api_router.include_router(recognition.router)
api_router.include_router(phrase.router)
api_router.include_router(face.router)
api_router.include_router(dataset.router)
