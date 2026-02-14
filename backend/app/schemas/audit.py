from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    store_id: int | None = None
    user_id: int | None = None
    user_email: str | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    request_path: str | None = None
    request_method: str | None = None
    request_ip: str | None = None
    before_data: dict | None = None
    after_data: dict | None = None
    created_at: datetime


class AuditLogListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    limit: int
    offset: int
