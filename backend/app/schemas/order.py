from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from pydantic import condecimal, field_serializer


MoneyNonNegative = condecimal(ge=0, max_digits=10, decimal_places=2)


class OrderItemIn(BaseModel):
    product_id: int
    variant_id: int
    quantity: int = Field(ge=1)


class OrderAddressIn(BaseModel):
    recipient_name: str
    phone: str
    cep: str
    street: str
    number: str = ""
    complement: str = ""
    neighborhood: str
    city: str
    state: str


class OrderCreateIn(BaseModel):
    store_id: int | None = None
    store_slug: str | None = None
    customer_id: int | None = None
    items: list[OrderItemIn]
    shipping_service: str
    shipping_price: MoneyNonNegative = Field(ge=0)
    shipping_eta_days: int = Field(ge=0)
    address: OrderAddressIn
    coupon_code: str | None = Field(default=None, description="Cupom de desconto (opcional).")
    # NOTE: 'discount' is ignored by the backend for security reasons.
    discount: MoneyNonNegative = Field(default=0, ge=0)


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_id: int
    variant_id: int
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    product_name: str
    variant_label: str
    image_url: str

    @field_serializer("unit_price", "line_total")
    def _ser_money(self, v: Decimal):
        return float(v)


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    created_at: str
    shipping_service: str
    shipping_price: Decimal
    shipping_eta_days: int
    subtotal: Decimal
    discount: Decimal
    total: Decimal

    recipient_name: str
    phone: str
    cep: str
    street: str
    number: str
    complement: str
    neighborhood: str
    city: str
    state: str

    items: list[OrderItemOut]

    @field_serializer("shipping_price", "subtotal", "discount", "total")
    def _ser_money(self, v: Decimal):
        return float(v)
