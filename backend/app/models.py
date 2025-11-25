import uuid
import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(sa.String, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    is_verified: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    mfa_enabled: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    mfa_secret_encrypted: Mapped[bytes | None] = mapped_column(sa.LargeBinary, nullable=True)
    created_at: Mapped[str] = mapped_column(sa.DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[str | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    accounts: Mapped[list["Account"]] = relationship(back_populates="user")
    trades: Mapped[list["Trade"]] = relationship(back_populates="user")
    connections: Mapped[list["OAuthConnection"]] = relationship(back_populates="user")

class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("users.id"), index=True)
    broker_name: Mapped[str] = mapped_column(sa.String)
    account_identifier: Mapped[str] = mapped_column(sa.String)
    created_at: Mapped[str] = mapped_column(sa.DateTime(timezone=True), server_default=func.now())
    user: Mapped[User] = relationship(back_populates="accounts")
    trades: Mapped[list["Trade"]] = relationship(back_populates="account")

class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("users.id"), index=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True, index=True)
    symbol: Mapped[str] = mapped_column(sa.String)
    side: Mapped[str] = mapped_column(sa.String)
    entry_time: Mapped[str] = mapped_column(sa.DateTime(timezone=True))
    exit_time: Mapped[str | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    entry_price: Mapped[float] = mapped_column(sa.Numeric(20, 8))
    exit_price: Mapped[float | None] = mapped_column(sa.Numeric(20, 8), nullable=True)
    quantity: Mapped[float] = mapped_column(sa.Numeric(20, 8))
    pnl: Mapped[float | None] = mapped_column(sa.Numeric(20, 8), nullable=True)
    gross_value: Mapped[float | None] = mapped_column(sa.Numeric(20, 8), nullable=True)
    fees: Mapped[float | None] = mapped_column(sa.Numeric(20, 8), nullable=True)
    r_multiple: Mapped[float | None] = mapped_column(sa.Numeric(20, 8), nullable=True)
    strategy: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    source_row_id: Mapped[str | None] = mapped_column(sa.String, nullable=True, index=True)
    import_hash: Mapped[str | None] = mapped_column(sa.String, nullable=True, index=True)
    exchange: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(sa.Text), nullable=True)
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[str] = mapped_column(sa.DateTime(timezone=True), server_default=func.now())
    user: Mapped[User] = relationship(back_populates="trades")
    account: Mapped[Account | None] = relationship(back_populates="trades")
    executions: Mapped[list["Execution"]] = relationship(back_populates="trade")

class Execution(Base):
    __tablename__ = "executions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("trades.id"), index=True)
    timestamp: Mapped[str] = mapped_column(sa.DateTime(timezone=True))
    price: Mapped[float] = mapped_column(sa.Numeric(20, 8))
    quantity: Mapped[float] = mapped_column(sa.Numeric(20, 8))
    broker_order_id: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    trade: Mapped[Trade] = relationship(back_populates="executions")

class OAuthConnection(Base):
    __tablename__ = "oauth_connections"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(sa.String)
    provider_account_id: Mapped[str] = mapped_column(sa.String)
    scopes: Mapped[list[str] | None] = mapped_column(ARRAY(sa.Text), nullable=True)
    access_token_encrypted: Mapped[bytes | None] = mapped_column(sa.LargeBinary, nullable=True)
    refresh_token_encrypted: Mapped[bytes | None] = mapped_column(sa.LargeBinary, nullable=True)
    id_token_encrypted: Mapped[bytes | None] = mapped_column(sa.LargeBinary, nullable=True)
    expires_at: Mapped[str | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    created_at: Mapped[str] = mapped_column(sa.DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[str | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    user: Mapped[User] = relationship(back_populates="connections")

class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("users.id"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(sa.String, index=True)
    device_info: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    created_at: Mapped[str] = mapped_column(sa.DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[str | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    expires_at: Mapped[str] = mapped_column(sa.DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(sa.Boolean, default=False)

class DailyStatistics(Base):
    __tablename__ = "daily_statistics"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("users.id"), index=True)
    date: Mapped[str] = mapped_column(sa.Date, index=True)
    pnl: Mapped[float | None] = mapped_column(sa.Numeric(20, 8), nullable=True)
    wins: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    losses: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
