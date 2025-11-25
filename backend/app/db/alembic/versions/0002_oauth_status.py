from alembic import op
import sqlalchemy as sa

revision = "0002_oauth_status"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("oauth_connections", sa.Column("failure_count", sa.Integer, server_default=sa.text("0"), nullable=False))
    op.add_column("oauth_connections", sa.Column("status", sa.String, nullable=True))

def downgrade():
    op.drop_column("oauth_connections", "status")
    op.drop_column("oauth_connections", "failure_count")