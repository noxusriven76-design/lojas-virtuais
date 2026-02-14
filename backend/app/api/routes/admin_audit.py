from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.permissions import require_audit_read
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogListOut, AuditLogOut


router = APIRouter(prefix="/admin/stores/{store_id}")


@router.get("/audit-logs", response_model=AuditLogListOut)
def list_audit_logs(
    store_id: int,
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_audit_read),
):
    query = db.query(AuditLog).filter(AuditLog.store_id == store_id)

    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to + timedelta(days=1))
    if q:
        token = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditLog.user_email.ilike(token),
                AuditLog.action.ilike(token),
                AuditLog.entity_type.ilike(token),
                AuditLog.entity_id.ilike(token),
                AuditLog.request_path.ilike(token),
            )
        )

    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset).all()
    items = [AuditLogOut.model_validate(row, from_attributes=True) for row in rows]
    return AuditLogListOut(items=items, total=total, limit=limit, offset=offset)


@router.get("/audit-logs/export.csv")
def export_audit_logs_csv(
    store_id: int,
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=2000, ge=1, le=10000),
    db: Session = Depends(get_db),
    _=Depends(require_audit_read),
):
    query = db.query(AuditLog).filter(AuditLog.store_id == store_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to + timedelta(days=1))
    if q:
        token = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditLog.user_email.ilike(token),
                AuditLog.action.ilike(token),
                AuditLog.entity_type.ilike(token),
                AuditLog.entity_id.ilike(token),
                AuditLog.request_path.ilike(token),
            )
        )

    rows = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "created_at",
            "store_id",
            "user_id",
            "user_email",
            "action",
            "entity_type",
            "entity_id",
            "request_method",
            "request_path",
            "request_ip",
            "before_data",
            "after_data",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.id,
                row.created_at.isoformat() if row.created_at else "",
                row.store_id or "",
                row.user_id or "",
                row.user_email or "",
                row.action,
                row.entity_type,
                row.entity_id or "",
                row.request_method or "",
                row.request_path or "",
                row.request_ip or "",
                json.dumps(row.before_data or {}, ensure_ascii=True),
                json.dumps(row.after_data or {}, ensure_ascii=True),
            ]
        )

    filename = f"audit_store_{store_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
