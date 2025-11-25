from .celery_app import celery
import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
from app.config import settings
from app.models import OAuthConnection
from app.services.encryption import decrypt, encrypt
import httpx

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def _refresh_due_tokens():
    async with SessionLocal() as db:
        horizon = datetime.now(timezone.utc) + timedelta(minutes=5)
        result = await db.execute(select(OAuthConnection).where(
            OAuthConnection.revoked == False,
            OAuthConnection.expires_at != None,
            OAuthConnection.expires_at <= horizon,
        ))
        conns = result.scalars().all()
        for conn in conns:
            try:
                if conn.provider == "google" and conn.refresh_token_encrypted:
                    refresh_token = decrypt(conn.refresh_token_encrypted)
                    async with httpx.AsyncClient() as client:
                        data = {
                            "client_id": settings.google_client_id,
                            "client_secret": settings.google_client_secret,
                            "grant_type": "refresh_token",
                            "refresh_token": refresh_token,
                        }
                        resp = await client.post("https://oauth2.googleapis.com/token", data=data)
                        resp.raise_for_status()
                        tok = resp.json()
                        access_token = tok.get("access_token")
                        expires_in = tok.get("expires_in")
                        await db.execute(update(OAuthConnection).where(OAuthConnection.id == conn.id).values(
                            access_token_encrypted=encrypt(access_token) if access_token else conn.access_token_encrypted,
                            expires_at=datetime.now(timezone.utc) + timedelta(seconds=int(expires_in or 0)),
                            last_used_at=datetime.now(timezone.utc),
                            failure_count=0,
                            status="active",
                        ))
                else:
                    await db.execute(update(OAuthConnection).where(OAuthConnection.id == conn.id).values(last_used_at=datetime.now(timezone.utc)))
            except Exception:
                await db.execute(update(OAuthConnection).where(OAuthConnection.id == conn.id).values(
                    failure_count=(conn.failure_count or 0) + 1,
                    status="refresh_failed",
                ))
        await db.commit()

@celery.task
def refresh_tokens_task():
    asyncio.run(_refresh_due_tokens())