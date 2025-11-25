from pydantic_settings import BaseSettings
from typing import List
from pydantic import field_validator

class Settings(BaseSettings):
    app_env: str = "dev"
    app_port: int = 8000
    database_url: str
    app_jwt_secret: str
    app_jwt_alg: str = "HS256"
    oauth_token_encryption_key: str
    session_secret: str | None = None
    redis_url: str
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None
    github_redirect_uri: str | None = None
    zerodha_api_key: str | None = None
    zerodha_api_secret: str | None = None
    zerodha_redirect_uri: str | None = None
    cors_allow_origins: List[str] = ["*"]
    timescale_enabled: bool = False
    base_url: str | None = None
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = None
    supabase_jwks_url: str | None = None
    pool_size: int = 10
    max_overflow: int = 20

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _coerce_origins(cls, v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("[") and s.endswith("]"):
                try:
                    import json
                    return json.loads(s)
                except Exception:
                    pass
            if "," in s:
                return [p.strip() for p in s.split(",") if p.strip()]
            if s:
                return [s]
        return ["*"]

settings = Settings()