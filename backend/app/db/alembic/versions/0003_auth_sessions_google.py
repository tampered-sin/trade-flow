from alembic import op
import sqlalchemy as sa
import uuid
from sqlalchemy.dialects.postgresql import UUID

revision = "0003_auth_sessions_google"
down_revision = "0002_oauth_status"
branch_labels = None
depends_on = None

def upgrade():
    # users additions
    op.add_column("users", sa.Column("is_verified", sa.Boolean, server_default=sa.text("false")))
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean, server_default=sa.text("false")))
    op.add_column("users", sa.Column("mfa_secret_encrypted", sa.LargeBinary, nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))

    # oauth_connections additions
    op.add_column("oauth_connections", sa.Column("id_token_encrypted", sa.LargeBinary, nullable=True))

    # sessions table
    op.create_table(
        "sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("refresh_token_hash", sa.String, nullable=False),
        sa.Column("device_info", sa.String, nullable=True),
        sa.Column("ip_address", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean, server_default=sa.text("false")),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"], unique=False)
    op.create_index("ix_sessions_refresh_hash", "sessions", ["refresh_token_hash"], unique=False)

def downgrade():
    op.drop_index("ix_sessions_refresh_hash", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_column("oauth_connections", "id_token_encrypted")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "mfa_secret_encrypted")
    op.drop_column("users", "mfa_enabled")
    op.drop_column("users", "is_verified")