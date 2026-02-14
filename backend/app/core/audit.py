from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.schemas.user import UserOut


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def write_audit_log(
    db: Session,
    *,
    request: Request | None,
    user: UserOut | None,
    store_id: int | None,
    action: str,
    entity_type: str,
    entity_id: str | int | None = None,
    before_data: dict[str, Any] | None = None,
    after_data: dict[str, Any] | None = None,
) -> AuditLog:
    request_ip = request.client.host if request and request.client else None
    row = AuditLog(
        store_id=store_id,
        user_id=user.id if user else None,
        user_email=str(user.email) if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        request_path=request.url.path if request else None,
        request_method=request.method if request else None,
        request_ip=request_ip,
        before_data=_to_jsonable(before_data) if before_data else None,
        after_data=_to_jsonable(after_data) if after_data else None,
    )
    db.add(row)
    db.flush()
    return row
