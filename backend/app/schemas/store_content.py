from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StoreContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    store_id: int
    banner_title: str
    banner_subtitle: str
    banner_image_url: str | None = None
    highlight_title: str
    highlight_text: str
    institutional_text: str


class StoreContentUpdateIn(BaseModel):
    banner_title: str | None = Field(default=None, max_length=180)
    banner_subtitle: str | None = Field(default=None, max_length=300)
    highlight_title: str | None = Field(default=None, max_length=180)
    highlight_text: str | None = None
    institutional_text: str | None = None

    @field_validator("banner_title", "banner_subtitle", "highlight_title", "highlight_text", "institutional_text")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()
