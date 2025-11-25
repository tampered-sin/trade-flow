import os
import base64
import secrets
from hashlib import sha256
from datetime import datetime, timedelta, timezone

REFRESH_TOKEN_BYTES = 48

def generate_refresh_token() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(REFRESH_TOKEN_BYTES)).decode()

def hash_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()

def refresh_expiry(minutes: int = 60 * 24 * 14) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)