import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from ..config import settings

def _load_key() -> bytes:
    raw = settings.oauth_token_encryption_key
    try:
        return base64.urlsafe_b64decode(raw)
    except Exception:
        pass
    b = raw.encode()
    if len(b) >= 32:
        return b[:32]
    return (b + (b"\0" * 32))[:32]

_KEY = _load_key()

def encrypt(data: str) -> bytes:
    aesgcm = AESGCM(_KEY)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, data.encode(), None)
    return nonce + ct

def decrypt(token: bytes) -> str:
    aesgcm = AESGCM(_KEY)
    nonce = token[:12]
    ct = token[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()