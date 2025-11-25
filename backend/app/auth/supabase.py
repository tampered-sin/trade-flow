from typing import Optional
from jose import jwt
import httpx
from ..config import settings

class SupabaseTokenError(Exception):
    pass

async def verify_supabase_token(token: str) -> dict:
    if settings.supabase_jwt_secret:
        try:
            return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"])
        except Exception as e:
            raise SupabaseTokenError(str(e))
    jwks_url: Optional[str] = settings.supabase_jwks_url
    if not jwks_url and settings.supabase_url:
        jwks_url = settings.supabase_url.rstrip("/") + "/auth/v1/jwks"
    if not jwks_url:
        raise SupabaseTokenError("No Supabase verification method configured")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_url, timeout=10)
            resp.raise_for_status()
            jwks = resp.json()
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        key = None
        for k in jwks.get("keys", []):
            if k.get("kid") == kid:
                key = k
                break
        if not key:
            raise SupabaseTokenError("No matching JWK")
        return jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
    except Exception as e:
        raise SupabaseTokenError(str(e))