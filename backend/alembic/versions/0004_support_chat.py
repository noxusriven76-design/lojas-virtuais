"""add support chat tables

Revision ID: 0004_support_chat
Revises: 0003_coupons
Create Date: 2026-01-30

Adds:
- support_conversations: per-customer conversation lifecycle
- support_messages: message history (async; ready for future websocket push)
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_support_chat"
down_revision = "0003_coupons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("customer_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            server_onupdate=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
    )
    op.create_index(op.f("ix_support_conversations_id"), "support_conversations", ["id"])
    op.create_index(op.f("ix_support_conversations_store_id"), "support_conversations", ["store_id"])
    op.create_index(op.f("ix_support_conversations_customer_user_id"), "support_conversations", ["customer_user_id"])
    op.create_index("ix_support_conversations_store_status_last", "support_conversations", ["store_id", "status", "last_message_at"])
    op.create_index("ix_support_conversations_customer_status", "support_conversations", ["customer_user_id", "status"])

    op.create_table(
        "support_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("support_conversations.id"),
            nullable=False,
        ),
        sa.Column("sender_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sender_role", sa.String(length=10), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(op.f("ix_support_messages_id"), "support_messages", ["id"])
    op.create_index(op.f("ix_support_messages_conversation_id"), "support_messages", ["conversation_id"])
    op.create_index(op.f("ix_support_messages_sender_user_id"), "support_messages", ["sender_user_id"])
    op.create_index("ix_support_messages_conversation_created", "support_messages", ["conversation_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_support_messages_conversation_created", table_name="support_messages")
    op.drop_index(op.f("ix_support_messages_sender_user_id"), table_name="support_messages")
    op.drop_index(op.f("ix_support_messages_conversation_id"), table_name="support_messages")
    op.drop_index(op.f("ix_support_messages_id"), table_name="support_messages")
    op.drop_table("support_messages")

    op.drop_index("ix_support_conversations_customer_status", table_name="support_conversations")
    op.drop_index("ix_support_conversations_store_status_last", table_name="support_conversations")
    op.drop_index(op.f("ix_support_conversations_customer_user_id"), table_name="support_conversations")
    op.drop_index(op.f("ix_support_conversations_store_id"), table_name="support_conversations")
    op.drop_index(op.f("ix_support_conversations_id"), table_name="support_conversations")
    op.drop_table("support_conversations")
