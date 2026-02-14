"""catalog jobs queue for phase 5

Revision ID: 0016_catalog_jobs_scale
Revises: 0015_order_operations_phase4
Create Date: 2026-02-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0016_catalog_jobs_scale"
down_revision = "0015_order_operations_phase4"
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
    if not _has_table("catalog_jobs"):
        op.create_table(
            "catalog_jobs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("job_type", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("result", sa.JSON(), nullable=True),
            sa.Column("error_message", sa.String(length=1000), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
        )

    if _has_table("catalog_jobs"):
        if not _has_index("catalog_jobs", "ix_catalog_jobs_id"):
            op.create_index("ix_catalog_jobs_id", "catalog_jobs", ["id"], unique=False)
        if not _has_index("catalog_jobs", "ix_catalog_jobs_store_id"):
            op.create_index("ix_catalog_jobs_store_id", "catalog_jobs", ["store_id"], unique=False)
        if not _has_index("catalog_jobs", "ix_catalog_jobs_user_id"):
            op.create_index("ix_catalog_jobs_user_id", "catalog_jobs", ["user_id"], unique=False)
        if not _has_index("catalog_jobs", "ix_catalog_jobs_job_type"):
            op.create_index("ix_catalog_jobs_job_type", "catalog_jobs", ["job_type"], unique=False)
        if not _has_index("catalog_jobs", "ix_catalog_jobs_store_status_created"):
            op.create_index(
                "ix_catalog_jobs_store_status_created",
                "catalog_jobs",
                ["store_id", "status", "created_at"],
                unique=False,
            )


def downgrade() -> None:
    if not _has_table("catalog_jobs"):
        return
    for idx in [
        "ix_catalog_jobs_store_status_created",
        "ix_catalog_jobs_job_type",
        "ix_catalog_jobs_user_id",
        "ix_catalog_jobs_store_id",
        "ix_catalog_jobs_id",
    ]:
        if _has_index("catalog_jobs", idx):
            op.drop_index(idx, table_name="catalog_jobs")
    op.drop_table("catalog_jobs")
