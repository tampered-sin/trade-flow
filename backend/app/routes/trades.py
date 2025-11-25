from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from uuid import uuid4
from ..deps import get_db, get_current_user
from ..models import Trade
from ..schemas import TradeCreate, TradeOut

router = APIRouter()

@router.post("", response_model=TradeOut)
async def create_trade(body: TradeCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    trade = Trade(
        id=uuid4(),
        user_id=user.id,
        account_id=body.account_id,
        symbol=body.symbol,
        side=body.side,
        entry_time=body.entry_time,
        exit_time=body.exit_time,
        entry_price=body.entry_price,
        exit_price=body.exit_price,
        quantity=body.quantity,
        pnl=body.pnl,
        r_multiple=body.r_multiple,
        strategy=body.strategy,
        tags=body.tags,
        notes=body.notes,
    )
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    return trade

@router.get("")
async def list_trades(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    symbol: str | None = None,
    tag: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    filters = [Trade.user_id == user.id]
    if symbol:
        filters.append(Trade.symbol == symbol)
    if tag:
        filters.append(func.array_position(Trade.tags, tag).isnot(None))
    if from_date:
        filters.append(Trade.entry_time >= from_date)
    if to_date:
        filters.append(Trade.entry_time <= to_date)
    q = select(Trade).where(and_(*filters)).order_by(Trade.entry_time.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "user_id": str(i.user_id),
            "account_id": str(i.account_id) if i.account_id else None,
            "symbol": i.symbol,
            "side": i.side,
            "entry_time": i.entry_time.isoformat(),
            "exit_time": i.exit_time.isoformat() if i.exit_time else None,
            "entry_price": float(i.entry_price),
            "exit_price": float(i.exit_price) if i.exit_price is not None else None,
            "quantity": float(i.quantity),
            "pnl": float(i.pnl) if i.pnl is not None else None,
            "r_multiple": float(i.r_multiple) if i.r_multiple is not None else None,
            "strategy": i.strategy,
            "tags": i.tags,
            "notes": i.notes,
            "created_at": i.created_at.isoformat(),
        }
        for i in items
    ]