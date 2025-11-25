from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import httpx
from datetime import datetime, timezone
from ..services.encryption import decrypt
from ..deps import get_db, get_current_user
from ..models import OAuthConnection, User

router = APIRouter()

@router.get("")
async def list_connections(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(OAuthConnection).where(OAuthConnection.user_id == user.id))
    items = result.scalars().all()
    return [{"id": str(i.id), "provider": i.provider, "revoked": i.revoked} for i in items]

@router.post("/{id}/refresh")
async def refresh_connection(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(OAuthConnection).where(OAuthConnection.id == id, OAuthConnection.user_id == user.id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="not_found")
    return {"refreshed": str(conn.id)}

@router.post("/{id}/disconnect")
async def disconnect_connection(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(OAuthConnection).where(OAuthConnection.id == id, OAuthConnection.user_id == user.id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="not_found")
    if conn.provider == "google" and conn.access_token_encrypted:
        try:
            token = decrypt(conn.access_token_encrypted)
            async with httpx.AsyncClient() as client:
                await client.post("https://oauth2.googleapis.com/revoke", params={"token": token})
        except Exception:
            pass
    q = update(OAuthConnection).where(OAuthConnection.id == id, OAuthConnection.user_id == user.id).values(
        revoked=True,
        access_token_encrypted=None,
        refresh_token_encrypted=None,
        last_used_at=datetime.now(timezone.utc),
        status="revoked",
    )
    await db.execute(q)
    await db.commit()
    return {"disconnected": id}