import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.main import app
from app.config import settings
from app.models import Base, User, OAuthConnection

@pytest.mark.asyncio
async def test_google_callback_monkeypatch(monkeypatch):
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    class DummyOAuth:
        async def authorize_access_token(self, request, code_verifier=None):
            return {"access_token": "access", "refresh_token": "refresh", "expires_in": 3600, "scope": "openid email profile"}
        async def parse_id_token(self, request, token):
            return {"email": "oauth@example.com", "name": "User", "sub": "subid"}

    from app.providers.oauth import oauth
    monkeypatch.setattr(oauth, "google", DummyOAuth())

    async with AsyncClient(app=app, base_url="http://test") as ac:
        r = await ac.get("/oauth/google/callback")
        assert r.status_code == 200

    async with SessionLocal() as db:
        res = await db.execute(select(User).where(User.email == "oauth@example.com"))
        user = res.scalar_one_or_none()
        assert user is not None
        res2 = await db.execute(select(OAuthConnection).where(OAuthConnection.user_id == user.id))
        conn = res2.scalar_one_or_none()
        assert conn is not None
        assert conn.provider == "google"
        assert conn.access_token_encrypted is not None