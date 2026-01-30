from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field

from pydantic import condecimal, field_serializer


MoneyNonNegative = condecimal(ge=0, max_digits=10, decimal_places=2)


class ShippingQuoteItemIn(BaseModel):
    product_id: int
    variant_id: int
    quantity: int = Field(ge=1)


class ShippingQuoteIn(BaseModel):
    store_id: int | None = None
    store_slug: str | None = None
    cep: str
    items: list[ShippingQuoteItemIn]


class ShippingOptionOut(BaseModel):
    service: str
    price: Decimal
    eta_days: int

    @field_serializer("price")
    def _ser_price(self, v: Decimal):
        return float(v)


class ShippingQuoteOut(BaseModel):
    cep: str
    options: list[ShippingOptionOut]
