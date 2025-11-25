from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..deps import get_db, get_current_user
from ..models import Trade

router = APIRouter()

@router.get("/equity-curve")
async def equity_curve(db: AsyncSession = Depends(get_db), user=Depends(get_current_user), from_date: str | None = None, to_date: str | None = None):
    q = select(func.date_trunc("day", Trade.entry_time).label("d"), func.sum(Trade.pnl)).where(Trade.user_id == user.id)
    if from_date:
        q = q.where(Trade.entry_time >= from_date)
    if to_date:
        q = q.where(Trade.entry_time <= to_date)
    q = q.group_by("d").order_by("d")
    result = await db.execute(q)
    rows = result.all()
    total = 0.0
    series = []
    for d, s in rows:
        v = float(s or 0)
        total += v
        series.append({"date": d.date().isoformat(), "value": total})
    return series

@router.get("/winrate")
async def winrate(db: AsyncSession = Depends(get_db), user=Depends(get_current_user), from_date: str | None = None, to_date: str | None = None):
    q = select(Trade.pnl).where(Trade.user_id == user.id)
    if from_date:
        q = q.where(Trade.entry_time >= from_date)
    if to_date:
        q = q.where(Trade.entry_time <= to_date)
    result = await db.execute(q)
    pnls = [float(x[0]) for x in result.all() if x[0] is not None]
    total = len(pnls)
    wins = len([p for p in pnls if p > 0])
    losses = len([p for p in pnls if p < 0])
    rate = (wins / total) if total > 0 else 0.0
    return {"winrate": rate, "total": total, "wins": wins, "losses": losses}