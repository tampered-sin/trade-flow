from alembic import op
import sqlalchemy as sa
import uuid
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String, nullable=False),
        sa.Column("name", sa.String, nullable=True),
        sa.Column("password_hash", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("broker_name", sa.String, nullable=False),
        sa.Column("account_identifier", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_accounts_user_id", "accounts", ["user_id"], unique=False)
    op.create_table(
        "trades",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("symbol", sa.String, nullable=False),
        sa.Column("side", sa.String, nullable=False),
        sa.Column("entry_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entry_price", sa.Numeric(20, 8), nullable=False),
        sa.Column("exit_price", sa.Numeric(20, 8), nullable=True),
        sa.Column("quantity", sa.Numeric(20, 8), nullable=False),
        sa.Column("pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("r_multiple", sa.Numeric(20, 8), nullable=True),
        sa.Column("strategy", sa.String, nullable=True),
        sa.Column("tags", ARRAY(sa.Text), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_trades_user_id", "trades", ["user_id"], unique=False)
    op.create_index("ix_trades_account_id", "trades", ["account_id"], unique=False)
    op.create_index("ix_trades_entry_time", "trades", ["entry_time"], unique=False)
    op.create_table(
        "executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("trade_id", UUID(as_uuid=True), sa.ForeignKey("trades.id"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price", sa.Numeric(20, 8), nullable=False),
        sa.Column("quantity", sa.Numeric(20, 8), nullable=False),
        sa.Column("broker_order_id", sa.String, nullable=True),
    )
    op.create_index("ix_executions_trade_id", "executions", ["trade_id"], unique=False)
    op.create_table(
        "oauth_connections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String, nullable=False),
        sa.Column("provider_account_id", sa.String, nullable=False),
        sa.Column("scopes", ARRAY(sa.Text), nullable=True),
        sa.Column("access_token_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("refresh_token_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_oauth_user_id", "oauth_connections", ["user_id"], unique=False)
    op.create_index("ix_oauth_provider", "oauth_connections", ["provider"], unique=False)
    op.create_index("ix_oauth_provider_account", "oauth_connections", ["provider", "provider_account_id"], unique=False)
    op.create_table(
        "daily_statistics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("wins", sa.Integer, nullable=True),
        sa.Column("losses", sa.Integer, nullable=True),
    )
    op.create_index("ix_daily_stats_user_date", "daily_statistics", ["user_id", "date"], unique=True)

def downgrade():
    op.drop_table("daily_statistics")
    op.drop_table("oauth_connections")
    op.drop_table("executions")
    op.drop_table("trades")
    op.drop_table("accounts")
    op.drop_table("users")