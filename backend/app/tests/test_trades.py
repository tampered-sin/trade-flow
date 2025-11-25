import pytest
from datetime import datetime
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_trades_flow():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        health = await ac.get("/health")
        assert health.status_code == 200