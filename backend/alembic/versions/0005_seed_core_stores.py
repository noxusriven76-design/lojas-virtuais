"""ensure core stores exist

Revision ID: 0005_seed_core_stores
Revises: 0004_support_chat
Create Date: 2026-01-30

Guarantees that the platform has the 3 initial stores required by the project:
- roupas
- relogios
- agro

The migration is idempotent (safe to run on environments that already have these rows).
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_seed_core_stores"
down_revision = "0004_support_chat"
branch_labels = None
depends_on = None


def _ensure_store(conn, *, name: str, slug: str) -> None:
    row = conn.execute(sa.text("SELECT id FROM stores WHERE slug = :slug LIMIT 1"), {"slug": slug}).fetchone()
    if row:
        # Keep existing name/is_active as-is (don't surprise prod).
        return
    conn.execute(
        sa.text("INSERT INTO stores (name, slug, is_active) VALUES (:name, :slug, 1)"),
        {"name": name, "slug": slug},
    )


def upgrade() -> None:
    conn = op.get_bind()
    _ensure_store(conn, name="Loja de Roupas", slug="roupas")
    _ensure_store(conn, name="Loja de Relógios", slug="relogios")
    _ensure_store(conn, name="Loja Agro", slug="agro")


def downgrade() -> None:
    # Downgrade keeps data (safe default). No-op.
    pass
