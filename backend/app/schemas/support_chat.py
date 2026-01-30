from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SupportConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    store_id: int
    customer_user_id: int
    status: str
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime | None
    closed_at: datetime | None


class SupportMessageCreateIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def _body(cls, v: str):
        v = (v or "").strip()
        if not v:
            raise ValueError("body required")
        return v


class SupportMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_user_id: int
    sender_role: str
    body: str
    created_at: datetime
