from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


class CouponBase(BaseModel):
    code: str = Field(min_length=2, max_length=40, description="Código do cupom (case-insensitive).")
    kind: str = Field(description="Tipo do cupom: 'percent' ou 'fixed'.")
    percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    expires_at: datetime | None = None
    usage_limit_total: int = Field(default=0, ge=0, description="0 = ilimitado")
    usage_limit_per_user: int = Field(default=0, ge=0, description="0 = ilimitado")
    active: bool = True

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: str):
        v = (v or "").strip().lower()
        if v not in ("percent", "fixed"):
            raise ValueError("kind must be 'percent' or 'fixed'")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v: str):
        v = (v or "").strip()
        if not v:
            raise ValueError("code required")
        if " " in v:
            raise ValueError("code cannot contain spaces")
        return v

    @field_validator("percent")
    @classmethod
    def _percent(cls, v: Decimal):
        return Decimal(v or 0)

    @field_validator("amount")
    @classmethod
    def _amount(cls, v: Decimal):
        return Decimal(v or 0)


class CouponCreateIn(CouponBase):
    pass


class CouponUpdateIn(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=40)
    kind: str | None = None
    percent: Decimal | None = Field(default=None, ge=0, le=100)
    amount: Decimal | None = Field(default=None, ge=0)
    expires_at: datetime | None = None
    usage_limit_total: int | None = Field(default=None, ge=0)
    usage_limit_per_user: int | None = Field(default=None, ge=0)
    active: bool | None = None


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    store_id: int
    code: str
    kind: str
    percent: Decimal
    amount: Decimal
    expires_at: datetime | None
    usage_limit_total: int
    usage_limit_per_user: int
    used_count: int
    active: bool
    created_at: datetime
    updated_at: datetime

    @field_serializer("percent", "amount")
    def _ser_money(self, v: Decimal):
        return float(v)


class CouponValidateIn(BaseModel):
    store_id: int | None = None
    store_slug: str | None = None
    code: str = Field(min_length=2, max_length=40)
    subtotal: Decimal = Field(ge=0)


class CouponValidateOut(BaseModel):
    valid: bool
    code: str | None = None
    kind: str | None = None
    discount: float = 0.0
    reason: str | None = None
