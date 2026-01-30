from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class AddressBase(BaseModel):
    label: str = "Casa"
    recipient_name: str
    phone: str
    cep: str
    street: str
    number: str = ""
    complement: str = ""
    neighborhood: str
    city: str
    state: str
    is_default: bool = False


class AddressCreate(AddressBase):
    customer_id: int | None = None


class AddressUpdate(BaseModel):
    label: str | None = None
    recipient_name: str | None = None
    phone: str | None = None
    cep: str | None = None
    street: str | None = None
    number: str | None = None
    complement: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None
    is_default: bool | None = None


class AddressOut(AddressBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
