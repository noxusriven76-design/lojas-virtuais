from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

ALLOWED_PAYMENT_METHOD_CODES = {"pix", "credit_card", "debit_card", "boleto", "cash"}


def normalize_payment_method_code(value: str) -> str:
    code = str(value or "").strip().lower()
    aliases = {
        "card": "credit_card",
        "cartao": "credit_card",
        "cartao_credito": "credit_card",
        "cartao-de-credito": "credit_card",
        "cartao_de_credito": "credit_card",
        "cartao_debito": "debit_card",
        "cartao-debito": "debit_card",
    }
    code = aliases.get(code, code)
    return code


class StorePaymentMethodBase(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    label: str = Field(min_length=2, max_length=120)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=9999)
    min_amount: Decimal | None = Field(default=None, ge=0)
    max_amount: Decimal | None = Field(default=None, ge=0)
    installments_max: int | None = Field(default=None, ge=1, le=36)
    fee_percent: Decimal | None = Field(default=None, ge=0, le=100)
    settlement_days: int | None = Field(default=None, ge=0, le=365)
    metadata_json: dict | None = None


class StorePaymentMethodCreateIn(StorePaymentMethodBase):
    pass


class StorePaymentMethodUpdateIn(BaseModel):
    label: str | None = Field(default=None, min_length=2, max_length=120)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=9999)
    min_amount: Decimal | None = Field(default=None, ge=0)
    max_amount: Decimal | None = Field(default=None, ge=0)
    installments_max: int | None = Field(default=None, ge=1, le=36)
    fee_percent: Decimal | None = Field(default=None, ge=0, le=100)
    settlement_days: int | None = Field(default=None, ge=0, le=365)
    metadata_json: dict | None = None


class StorePaymentMethodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    store_id: int
    code: str
    label: str
    is_active: bool
    sort_order: int
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    installments_max: int | None = None
    fee_percent: Decimal | None = None
    settlement_days: int | None = None
    metadata_json: dict | None = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("min_amount", "max_amount", "fee_percent")
    def _ser_decimal(self, value: Decimal | None):
        if value is None:
            return None
        return float(value)


class StorePaymentMethodListOut(BaseModel):
    items: list[StorePaymentMethodOut]
    total: int


class StorePaymentMethodReorderItemIn(BaseModel):
    id: int
    sort_order: int = Field(ge=0, le=9999)


class StorePaymentMethodReorderIn(BaseModel):
    items: list[StorePaymentMethodReorderItemIn] = Field(default_factory=list)

