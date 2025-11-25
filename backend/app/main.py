from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from .config import settings
from .routes.auth import router as auth_router
from .routes.connections import router as connections_router
from .routes.trades import router as trades_router
from .routes.imports import router as imports_router
from .routes.analytics import router as analytics_router
from .routes.webhooks import router as webhooks_router

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.session_secret:
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, https_only=False, same_site="lax")

app.include_router(auth_router, prefix="/auth")
app.include_router(connections_router, prefix="/connections")
app.include_router(trades_router, prefix="/trades")
app.include_router(imports_router, prefix="/import")
app.include_router(analytics_router, prefix="/analytics")
app.include_router(webhooks_router, prefix="/webhook")

@app.get("/health")
async def health():
    return {"status": "ok"}
