import pytest
import asyncio
from app.tasks.refresh_tokens import _refresh_due_tokens
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.config import settings
from app.models import Base, User, OAuthConnection
from app.services.encryption import encrypt
from datetime import datetime, timedelta, timezone

class DummyResp:
    def __init__(self, data):
        self._data = data
    def raise_for_status(self):
        return None
    def json(self):
        return self._data

@pytest.mark.asyncio
async def test_refresh_task_monkeypatch(monkeypatch):
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        u = User(email="refresh@example.com")
        db.add(u)
        await db.commit()
        await db.refresh(u)
        conn = OAuthConnection(
            user_id=u.id,
            provider="google",
            provider_account_id="sub",
            access_token_encrypted=encrypt("old_access"),
            refresh_token_encrypted=encrypt("refresh_token"),
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=100),
            revoked=False,
        )
        db.add(conn)
        await db.commit()
        await db.refresh(conn)

    async def fake_post(url, data=None):
        return DummyResp({"access_token": "new_access", "expires_in": 3600})

    import httpx
    monkeypatch.setattr(httpx.AsyncClient, "post", lambda self, url, data=None: asyncio.ensure_future(fake_post(url, data)))

    await _refresh_due_tokens()

    async with SessionLocal() as db:
        res = await db.execute(select(OAuthConnection).where(OAuthConnection.id == conn.id))
        updated = res.scalar_one()
        assert updated.last_used_at is not None