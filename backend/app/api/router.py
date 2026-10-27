from fastapi import APIRouter

from .routes import apps, auth, chat, fde, health, knowledge, logs, model_options, models, retrieval

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(fde.router, prefix="/fde", tags=["fde"])
api_router.include_router(models.router, prefix="/models", tags=["models"])
api_router.include_router(model_options.router, prefix="/model-options", tags=["models"])
api_router.include_router(knowledge.router, prefix="/knowledge-bases", tags=["knowledge-bases"])
api_router.include_router(retrieval.router, prefix="/knowledge-bases", tags=["retrieval"])
api_router.include_router(apps.router, prefix="/apps", tags=["qa-apps"])
api_router.include_router(chat.app_router, prefix="/apps", tags=["chat"])
api_router.include_router(chat.conversation_router, prefix="/conversations", tags=["chat"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])

