import pytest
from httpx import AsyncClient
from datetime import datetime
from uuid import uuid4
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.config import settings
from app.models import Base, User
from app.auth.jwt import create_access_token

@pytest.mark.asyncio
async def test_import_dedupe(tmp_path):
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    user_id = uuid4()
    async with SessionLocal() as db:
        db.add(User(id=user_id, email="csv@example.com"))
        await db.commit()
    token = create_access_token(str(user_id))
    csv_data = "symbol,side,entry_time,entry_price,quantity\nAAPL,LONG,{} ,100.0,1\nAAPL,LONG,{} ,100.0,1\n".format(datetime.utcnow().isoformat(), datetime.utcnow().isoformat())
    async with AsyncClient(app=app, base_url="http://test") as ac:
        files = {"file": ("trades.csv", csv_data, "text/csv")}
        r = await ac.post("/import/csv", files=files, headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["imported"] == 1