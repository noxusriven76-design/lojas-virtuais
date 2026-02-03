from __future__ import annotations

from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    PositiveInt,
    AliasChoices,
    condecimal,
    field_validator,
    field_serializer,
)


MoneyPositive = condecimal(gt=0, max_digits=10, decimal_places=2)
MoneyNonNegative = condecimal(ge=0, max_digits=10, decimal_places=2)


class CategoryCreateIn(BaseModel):
    # Optional to preserve previous 400 validations (instead of 422)
    name: str | None = None


class CategoryUpdateIn(BaseModel):
    name: str | None = None
    parent_id: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    sort_order: int | None = None

    @field_validator("name")
    @classmethod
    def _strip_optional_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


# Admin input schemas (required fields + constraints)


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80, description="Category name")

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


class ProductCreateIn(BaseModel):
    # Optional to preserve previous 400 validations (instead of 422)
    category_id: int | None = None
    name: str | None = None
    base_price: Decimal | float | None = None
    description: str = ""
    image_url: str = ""
    is_active: bool = True


class ProductUpdateIn(BaseModel):
    # Optional to preserve previous 400 validations (instead of 422)
    name: str | None = None
    title: str | None = None
    description: str | None = None
    price: Decimal | float | None = Field(default=None, validation_alias=AliasChoices("price", "base_price"))
    is_active: bool | None = None
    category_id: int | None = Field(default=None, ge=1)
    sku: str | None = None
    image_url: str | None = None

    @field_validator("name", "title", "sku")
    @classmethod
    def _strip_optional_non_empty(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("value must not be empty")
        return v


class ProductCreate(BaseModel):
    category_id: PositiveInt = Field(..., description="Category id")
    name: str = Field(..., min_length=1, max_length=180, description="Product name")
    base_price: MoneyPositive = Field(..., description="Base price")
    description: str = Field("", max_length=2000)
    image_url: str = Field("", max_length=500)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _strip_product_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


class ProductVariantCreateIn(BaseModel):
    # Optional to preserve previous 400 validations (instead of 422)
    sku: str | None = None
    price: Decimal | float | None = None
    stock: int | None = None
    color: str = ""
    size: str = ""
    active: bool = True


class VariantCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=80, description="Unique SKU")
    price: MoneyPositive = Field(..., description="Variant price")
    stock: NonNegativeInt = Field(..., description="Available stock")
    color: str = Field("", max_length=50)
    size: str = Field("", max_length=20)
    active: bool = True

    @field_validator("sku")
    @classmethod
    def _strip_sku(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("sku must not be empty")
        return v


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    parent_id: int | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class CategoryTreeOut(CategoryOut):
    children: list["CategoryTreeOut"] | None = None


CategoryTreeOut.model_rebuild()


class ProductVariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sku: str
    color: str
    size: str
    price: Decimal
    @field_serializer("price")
    def _ser_price(self, v: Decimal):  # keep public API as JSON number
        return float(v)

    stock: int
    active: bool


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    name: str
    description: str
    image_url: str | None = None
    base_price: Decimal
    is_active: bool
    variants: list[ProductVariantOut]

    @field_serializer("base_price")
    def _ser_base_price(self, v: Decimal):  # keep public API as JSON number
        return float(v)


class ProductAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    name: str
    image_url: str | None = None
    base_price: Decimal
    is_active: bool

    @field_serializer("base_price")
    def _ser_base_price(self, v: Decimal):  # keep public API as JSON number
        return float(v)


class ProductDeleteOut(BaseModel):
    ok: bool
    mode: str
    message: str


class ProductImageOut(BaseModel):
    product_id: int
    image_url: str | None = None


class IdOut(BaseModel):
    id: int
