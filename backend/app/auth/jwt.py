from datetime import datetime, timedelta
from jose import jwt
from ..config import settings

def create_access_token(sub: str, expires_minutes: int = 15) -> str:
    payload = {
        "sub": sub,
        "exp": datetime.utcnow() + timedelta(minutes=expires_minutes),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.app_jwt_secret, algorithm=settings.app_jwt_alg)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.app_jwt_secret, algorithms=[settings.app_jwt_alg])
