"""Initial identity, revisioned saves, history and idempotency records."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("appid", sa.String(128).with_variant(sa.String(128, collation="utf8mb4_bin"), "mysql"), nullable=False),
                    sa.Column("openid", sa.String(128).with_variant(sa.String(128, collation="utf8mb4_bin"), "mysql"), nullable=False),
                    sa.UniqueConstraint("appid", "openid"))
    op.create_table("login_sessions", sa.Column("token_hash", sa.String(64), primary_key=True),
                    sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("expires_at", sa.Double(), nullable=False))
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])
    op.create_table("saves", sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
                    sa.Column("revision", sa.Integer(), nullable=False), sa.Column("payload", sa.JSON(), nullable=True),
                    sa.Column("updated_at", sa.Double(), nullable=False), sa.Column("settled_at", sa.Double(), nullable=False))
    op.create_table("save_snapshots", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("revision", sa.Integer(), nullable=False), sa.Column("payload", sa.JSON(), nullable=False),
                    sa.Column("created_at", sa.Double(), nullable=False), sa.UniqueConstraint("user_id", "revision"))
    op.create_index("ix_save_snapshots_user_id", "save_snapshots", ["user_id"])
    op.create_table("save_operations", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("request_id", sa.String(64), nullable=False), sa.Column("request_hash", sa.String(64), nullable=False),
                    sa.Column("response", sa.JSON(), nullable=False), sa.Column("created_at", sa.Double(), nullable=False),
                    sa.UniqueConstraint("user_id", "request_id"))
    op.create_index("ix_save_operations_user_id", "save_operations", ["user_id"])


def downgrade():
    for table in ["save_operations", "save_snapshots", "saves", "login_sessions", "users"]:
        op.drop_table(table)
