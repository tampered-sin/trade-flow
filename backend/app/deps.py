from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .db.session import get_session
from .auth.jwt import decode_token
from .auth.supabase import verify_supabase_token, SupabaseTokenError
from .models import User

async def get_db(session: AsyncSession = Depends(get_session)) -> AsyncSession:
    return session

async def get_current_user(authorization: str | None = Header(None), db: AsyncSession = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    token = authorization.split(" ", 1)[1]
    import uuid
    # Try local app JWT first
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if sub:
            user_id = uuid.UUID(sub)
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                return user
    except Exception:
        pass
    # Fallback to Supabase JWT
    try:
        sp_payload = await verify_supabase_token(token)
        sp_sub = sp_payload.get("sub")
        if not sp_sub:
            raise HTTPException(status_code=401, detail="unauthorized")
        user_id = uuid.UUID(sp_sub)
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            return user
        # Create user record lazily from Supabase claims
        email = sp_payload.get("email") or sp_payload.get("user_metadata", {}).get("email")
        u = User(id=user_id, email=email or "", name=None)
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u
    except SupabaseTokenError:
        raise HTTPException(status_code=401, detail="unauthorized")