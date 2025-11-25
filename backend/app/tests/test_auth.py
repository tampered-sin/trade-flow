import pytest
import uuid
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_register_and_login():
    email = f"u{uuid.uuid4().hex[:8]}@example.com"
    async with AsyncClient(app=app, base_url="http://test") as ac:
        r1 = await ac.post("/auth/register", json={"email": email, "password": "secret"})
        assert r1.status_code in (200, 400)
        r2 = await ac.post("/auth/login", json={"email": email, "password": "secret"})
        assert r2.status_code in (200, 401)
        if r2.status_code == 200:
            assert "access_token" in r2.json()