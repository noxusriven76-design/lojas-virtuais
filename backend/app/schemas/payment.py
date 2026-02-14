from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

SENSITIVE_KEYS = {
    "card_number",
    "number",
    "cvv",
    "security_code",
    "token",
    "access_token",
    "authorization",
    "password",
    "document",
    "cpf",
}


def _mask_sensitive(value):
    if isinstance(value, dict):
        masked: dict = {}
        for key, item in value.items():
            key_norm = str(key).strip().lower()
            if key_norm in SENSITIVE_KEYS:
                masked[key] = "***"
            else:
                masked[key] = _mask_sensitive(item)
        return masked
    if isinstance(value, list):
        return [_mask_sensitive(item) for item in value]
    return value


class PaymentTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    store_id: int
    order_id: int
    provider: str
    provider_payment_id: str | None = None
    status: str
    amount: Decimal
    currency: str
    method: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    paid_at: datetime | None = None
    refunded_amount: Decimal
    raw_payload: dict | None = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("amount", "refunded_amount")
    def _ser_money(self, value: Decimal):
        return float(value)

    @field_serializer("raw_payload")
    def _ser_payload(self, value: dict | None):
        if value is None:
            return None
        return _mask_sensitive(value)


class PaymentTransactionListOut(BaseModel):
    items: list[PaymentTransactionOut]
    total: int
    limit: int
    offset: int


class PaymentRefundIn(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    reason: str = Field(min_length=3, max_length=300)


class PaymentRefundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    store_id: int
    payment_transaction_id: int
    amount: Decimal
    status: str
    provider_refund_id: str | None = None
    reason: str
    created_at: datetime

    @field_serializer("amount")
    def _ser_money(self, value: Decimal):
        return float(value)


class PaymentReconciliationItemOut(BaseModel):
    order_id: int
    order_status: str
    order_total: Decimal
    payment_transaction_id: int | None = None
    payment_status: str | None = None
    payment_amount: Decimal | None = None
    discrepancy_type: str
    detail: str

    @field_serializer("order_total", "payment_amount")
    def _ser_money(self, value: Decimal | None):
        if value is None:
            return None
        return float(value)


class PaymentReconciliationOut(BaseModel):
    items: list[PaymentReconciliationItemOut]
    total: int
    limit: int
    offset: int


class PaymentRefundListOut(BaseModel):
    items: list[PaymentRefundOut]
    total: int


class PaymentWebhookEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    store_id: int | None = None
    provider: str
    event_id: str
    event_type: str
    signature_valid: bool
    status: str
    error_message: str | None = None
    processed_at: datetime | None = None
    created_at: datetime


class PaymentWebhookEventListOut(BaseModel):
    items: list[PaymentWebhookEventOut]
    total: int
