from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, date
import uuid

class RegisterRequest(BaseModel):
    email: EmailStr
    password: Optional[str] = None
    name: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TradeCreate(BaseModel):
    account_id: Optional[uuid.UUID] = None
    symbol: str
    side: str
    entry_time: datetime
    exit_time: Optional[datetime] = None
    entry_price: float
    exit_price: Optional[float] = None
    quantity: float
    pnl: Optional[float] = None
    r_multiple: Optional[float] = None
    strategy: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None

class TradeOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    account_id: Optional[uuid.UUID]
    symbol: str
    side: str
    entry_time: datetime
    exit_time: Optional[datetime]
    entry_price: float
    exit_price: Optional[float]
    quantity: float
    pnl: Optional[float]
    r_multiple: Optional[float]
    strategy: Optional[str]
    tags: Optional[List[str]]
    notes: Optional[str]
    created_at: datetime

class EquityPoint(BaseModel):
    date: date
    value: float

class WinrateResponse(BaseModel):
    winrate: float
    total: int
    wins: int
    losses: int