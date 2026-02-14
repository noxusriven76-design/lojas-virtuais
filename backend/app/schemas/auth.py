from __future__ import annotations

from pydantic import BaseModel, EmailStr


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class TwoFactorSetupOut(BaseModel):
    two_factor_enabled: bool
    secret: str
    otpauth_url: str


class TwoFactorCodeIn(BaseModel):
    code: str
