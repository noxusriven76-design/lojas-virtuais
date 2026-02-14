"""create admin audit logs table

Revision ID: 0014_admin_audit_logs
Revises: 0013_admin_auth_security_fields
Create Date: 2026-02-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0014_admin_audit_logs"
down_revision = "0013_admin_auth_security_fields"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    if not _has_table("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("user_email", sa.String(length=255), nullable=True),
            sa.Column("action", sa.String(length=80), nullable=False),
            sa.Column("entity_type", sa.String(length=80), nullable=False),
            sa.Column("entity_id", sa.String(length=64), nullable=True),
            sa.Column("request_path", sa.String(length=255), nullable=True),
            sa.Column("request_method", sa.String(length=16), nullable=True),
            sa.Column("request_ip", sa.String(length=64), nullable=True),
            sa.Column("before_data", sa.JSON(), nullable=True),
            sa.Column("after_data", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    if not _has_index("audit_logs", "ix_audit_logs_id"):
        op.create_index("ix_audit_logs_id", "audit_logs", ["id"], unique=False)
    if not _has_index("audit_logs", "ix_audit_logs_store_id"):
        op.create_index("ix_audit_logs_store_id", "audit_logs", ["store_id"], unique=False)
    if not _has_index("audit_logs", "ix_audit_logs_user_id"):
        op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)
    if not _has_index("audit_logs", "ix_audit_logs_action"):
        op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    if not _has_index("audit_logs", "ix_audit_logs_entity_type"):
        op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"], unique=False)
    if not _has_index("audit_logs", "ix_audit_logs_created_at"):
        op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)


def downgrade() -> None:
    if not _has_table("audit_logs"):
        return
    for idx in [
        "ix_audit_logs_created_at",
        "ix_audit_logs_entity_type",
        "ix_audit_logs_action",
        "ix_audit_logs_user_id",
        "ix_audit_logs_store_id",
        "ix_audit_logs_id",
    ]:
        if _has_index("audit_logs", idx):
            op.drop_index(idx, table_name="audit_logs")
    op.drop_table("audit_logs")

