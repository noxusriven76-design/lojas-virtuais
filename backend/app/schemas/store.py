from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class StoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str
    is_active: bool


class StoreCreateIn(BaseModel):
    name: str
    slug: str


class StoreMemberCreateIn(BaseModel):
    user_id: int
    role: str = "owner"
