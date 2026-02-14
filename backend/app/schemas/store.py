from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str
    logo_url: str | None = None
    is_active: bool


class StoreCreateIn(BaseModel):
    name: str
    slug: str


class StoreUpdateIn(BaseModel):
    name: str | None = None
    slug: str | None = None
    is_active: bool | None = None


class StoreLogoOut(BaseModel):
    store_id: int
    logo_url: str | None = None


class StoreCustomerOut(BaseModel):
    id: int
    name: str
    email: str | None = None
    phone: str | None = None
    created_at: datetime | None = None
    total_orders: int


class StoreCustomerListOut(BaseModel):
    items: list[StoreCustomerOut]
    total: int
    limit: int
    offset: int


class GlobalSearchProductOut(BaseModel):
    id: int
    name: str
    sku: str | None = None
    price: float
    is_active: bool


class GlobalSearchCustomerOut(BaseModel):
    id: int
    name: str
    email: str | None = None
    total_orders: int


class GlobalSearchOrderOut(BaseModel):
    id: int
    status: str
    total: float
    created_at: datetime
    customer_name: str | None = None


class GlobalSearchOut(BaseModel):
    query: str
    products: list[GlobalSearchProductOut]
    customers: list[GlobalSearchCustomerOut]
    orders: list[GlobalSearchOrderOut]


class MyStoreOut(BaseModel):
    store_id: int
    name: str
    slug: str
    logo_url: str | None = None
    is_active: bool
    role: str
    permissions: list[str] = []


class StoreMemberCreateIn(BaseModel):
    user_id: int
    role: str = "admin_loja"


class StoreMemberUpdateIn(BaseModel):
    role: str
