# Backend Architecture & Usage

## Architecture
- FastAPI (async) application with SQLAlchemy 2.0 async and `asyncpg` driver.
- PostgreSQL schema with Alembic migrations.
- Auth:
  - Local email/password with JWT.
  - OAuth via Authlib (Google, GitHub) and broker adapters (Zerodha placeholder).
  - HTTPOnly session middleware for OAuth state/nonce.
- Token storage encrypted at rest using AES‑256‑GCM with `OAUTH_TOKEN_ENCRYPTION_KEY`.
- Celery + Redis background tasks for token refresh (<5 min to expiry) and broker sync.
- Docker Compose services: `app`, `worker`, `beat`, `db`, `pgadmin`, `redis`.

## Run Locally
1) Copy `.env.example` to `.env` and fill values.
2) Start services:
```
docker compose up --build
```
3) Apply migrations inside the `app` container:
```
alembic upgrade head
```
4) Open API docs: `http://localhost:8000/docs`

## Environment Variables
Key variables (see `.env.example`):
- `DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/tradeflow`
- `APP_JWT_SECRET`, `APP_JWT_ALG=HS256`
- `OAUTH_TOKEN_ENCRYPTION_KEY` (base64 or 32‑byte key)
- `SESSION_SECRET` (enables session middleware for OAuth state)
- `BASE_URL=http://localhost:8000`
- `REDIS_URL=redis://redis:6379/0`
- Provider vars: `GOOGLE_*`, `GITHUB_*`, `ZERODHA_*` with redirect URIs
- `CORS_ALLOW_ORIGINS=http://localhost:5173`

Generate encryption key:
```
python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

## OAuth Registration
### Google (OIDC)
- Create a Google OAuth client (Web application).
- Authorized redirect URI: `http://localhost:8000/oauth/google/callback`
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- Start flow: `GET /oauth/google/login` (handled via Authlib). Callback validates ID token.

### GitHub
- Create OAuth App.
- Redirect URI: `http://localhost:8000/oauth/github/callback`
- Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`.

### Zerodha (Broker)
- Create Kite Connect app.
- Redirect URL: `http://localhost:8000/oauth/zerodha/callback`
- Set `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `ZERODHA_REDIRECT_URI`.
- Note: Zerodha uses `request_token`; exchange and sync implemented via adapter pattern (placeholders provided).

## Endpoints
- Auth: `POST /auth/register`, `POST /auth/login`
- OAuth: `GET /oauth/{provider}/login`, `GET /oauth/{provider}/callback`
- Connections: `GET /connections`, `POST /connections/{id}/refresh`, `POST /connections/{id}/disconnect`
- Trades: `POST /trades`, `GET /trades`
- Import: `POST /import/csv`
- Analytics: `GET /analytics/equity-curve`, `GET /analytics/winrate`
- Webhooks: `POST /webhook/{provider}`

## Migrations
Run inside `app` container:
```
alembic upgrade head
```

## Tests
Run tests locally:
```
pytest -q backend/app/tests
```
CI is provided via GitHub Actions (`.github/workflows/ci.yml`) which launches Postgres and Redis services and runs tests.

## Security Notes
- Store secrets only in environment variables or a secret manager.
- Rotate `APP_JWT_SECRET`, `SESSION_SECRET`, and `OAUTH_TOKEN_ENCRYPTION_KEY` periodically.
- Never log raw tokens; all tokens are encrypted at rest.
- Use HTTPS in production; set `same_site` and `secure` flags appropriately for cookies.

## Provider Adapter Interface
To add brokers, implement an adapter with methods:
- `authorize_url()`
- `exchange_code(code, code_verifier)`
- `refresh_token(refresh_token)`
- `revoke_token(access_token)`
- `get_account_id(userinfo_or_token)`
Then wire into the OAuth routes and Celery refresh logic.
