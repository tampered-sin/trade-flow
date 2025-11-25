from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import uuid4
from datetime import datetime, timezone
from ..schemas import RegisterRequest, LoginRequest, TokenResponse
from ..models import User, Session
from ..auth.password import hash_password, verify_password
from ..auth.jwt import create_access_token
from ..deps import get_db
from ..auth.tokens import generate_refresh_token, hash_token, refresh_expiry
from jose import jwt
from ..config import settings

router = APIRouter()

@router.post("/signup")
async def signup(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="email_exists")
    password_hash = hash_password(body.password) if body.password else None
    user = User(id=uuid4(), email=body.email, name=body.name, password_hash=password_hash, is_verified=False)
    db.add(user)
    await db.commit()
    # create verification token
    token = jwt.encode({"sub": str(user.id), "typ": "verify", "exp": datetime.utcnow().timestamp() + 3600}, settings.app_jwt_secret, algorithm=settings.app_jwt_alg)
    return {"id": str(user.id), "email": user.email, "verify_token": token}

@router.get("/verify")
async def verify(token: str, db: AsyncSession = Depends(get_db)):
    try:
        data = jwt.decode(token, settings.app_jwt_secret, algorithms=[settings.app_jwt_alg])
        if data.get("typ") != "verify":
            raise HTTPException(status_code=400, detail="invalid_token")
        import uuid
        user_id = uuid.UUID(data.get("sub"))
        await db.execute(update(User).where(User.id == user_id).values(is_verified=True))
        await db.commit()
        return {"verified": True}
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_token")

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="email_not_verified")
    # create session with refresh token
    refresh_token = generate_refresh_token()
    refresh_hash = hash_token(refresh_token)
    sess = Session(
        id=uuid4(),
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        device_info=None,
        ip_address=request.client.host if request.client else None,
        expires_at=refresh_expiry(),
        revoked=False,
        last_used_at=datetime.now(timezone.utc),
    )
    db.add(sess)
    await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc)))
    await db.commit()
    # set HttpOnly refresh cookie
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 14,
        path="/",
    )
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    cookie = request.cookies.get("refresh_token")
    if not cookie:
        raise HTTPException(status_code=401, detail="no_refresh")
    h = hash_token(cookie)
    result = await db.execute(select(Session).where(Session.refresh_token_hash == h, Session.revoked == False))
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=401, detail="invalid_refresh")
    if sess.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="expired_refresh")
    # rotate refresh token
    new_refresh = generate_refresh_token()
    new_hash = hash_token(new_refresh)
    await db.execute(update(Session).where(Session.id == sess.id).values(refresh_token_hash=new_hash, last_used_at=datetime.now(timezone.utc)))
    await db.commit()
    response.set_cookie("refresh_token", new_refresh, httponly=True, secure=False, samesite="lax", max_age=60 * 60 * 24 * 14, path="/")
    token = create_access_token(str(sess.user_id))
    return TokenResponse(access_token=token)

@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    cookie = request.cookies.get("refresh_token")
    if cookie:
        h = hash_token(cookie)
        await db.execute(update(Session).where(Session.refresh_token_hash == h).values(revoked=True))
        await db.commit()
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@router.post("/request-password-reset")
async def request_password_reset(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        return {"sent": True}
    token = jwt.encode({"sub": str(user.id), "typ": "reset", "exp": datetime.utcnow().timestamp() + 3600}, settings.app_jwt_secret, algorithm=settings.app_jwt_alg)
    return {"sent": True, "reset_token": token}

@router.post("/reset-password")
async def reset_password(token: str, new_password: str, db: AsyncSession = Depends(get_db)):
    try:
        data = jwt.decode(token, settings.app_jwt_secret, algorithms=[settings.app_jwt_alg])
        if data.get("typ") != "reset":
            raise HTTPException(status_code=400, detail="invalid_token")
        import uuid
        user_id = uuid.UUID(data.get("sub"))
        await db.execute(update(User).where(User.id == user_id).values(password_hash=hash_password(new_password)))
        await db.commit()
        return {"reset": True}
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_token")