import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_signup_verify_login_refresh_logout():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        r = await ac.post("/auth/signup", json={"email": "flow@example.com", "password": "secret"})
        assert r.status_code == 200
        verify_token = r.json()["verify_token"]
        r2 = await ac.get(f"/auth/verify?token={verify_token}")
        assert r2.status_code == 200
        r3 = await ac.post("/auth/login", json={"email": "flow@example.com", "password": "secret"})
        assert r3.status_code == 200
        # capture refresh cookie
        cookies = r3.headers.get("set-cookie", "")
        assert "refresh_token=" in cookies
        # send refresh with cookie
        ac.cookies.set("refresh_token", cookies.split("refresh_token=")[1].split(";")[0])
        r4 = await ac.post("/auth/refresh")
        assert r4.status_code == 200
        r5 = await ac.post("/auth/logout")
        assert r5.status_code == 200