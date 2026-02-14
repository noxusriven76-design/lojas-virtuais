"""add auth security fields to users

Revision ID: 0013_admin_auth_security_fields
Revises: 0012_product_gallery_images
Create Date: 2026-02-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0013_admin_auth_security_fields"
down_revision = "0012_product_gallery_images"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = inspector.get_columns(table_name)
    return any(c.get("name") == column_name for c in cols)


def upgrade() -> None:
    if not _has_table("users"):
        return

    if not _has_column("users", "password_changed_at"):
        op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column("users", "failed_login_attempts"):
        op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"))
    if not _has_column("users", "locked_until"):
        op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    if not _has_column("users", "last_login_at"):
        op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column("users", "token_version"):
        op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    if not _has_column("users", "two_factor_enabled"):
        op.add_column("users", sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    if not _has_column("users", "two_factor_secret"):
        op.add_column("users", sa.Column("two_factor_secret", sa.String(length=64), nullable=True))

    op.execute(
        """
        UPDATE users
        SET password_changed_at = COALESCE(password_changed_at, UTC_TIMESTAMP())
        """
    )


def downgrade() -> None:
    if not _has_table("users"):
        return
    if _has_column("users", "two_factor_secret"):
        op.drop_column("users", "two_factor_secret")
    if _has_column("users", "two_factor_enabled"):
        op.drop_column("users", "two_factor_enabled")
    if _has_column("users", "token_version"):
        op.drop_column("users", "token_version")
    if _has_column("users", "last_login_at"):
        op.drop_column("users", "last_login_at")
    if _has_column("users", "locked_until"):
        op.drop_column("users", "locked_until")
    if _has_column("users", "failed_login_attempts"):
        op.drop_column("users", "failed_login_attempts")
    if _has_column("users", "password_changed_at"):
        op.drop_column("users", "password_changed_at")

