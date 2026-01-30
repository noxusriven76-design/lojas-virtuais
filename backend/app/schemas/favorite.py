from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class FavoriteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_id: int
    customer_id: int
