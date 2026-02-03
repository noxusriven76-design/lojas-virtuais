from fastapi import APIRouter

from app.api.routes import auth, public_catalog, shipping, orders, addresses, favorites
from app.api.routes import admin_access
from app.api.routes import coupons
from app.api.routes import admin_catalog
from app.api.routes import pages
from app.api.routes import support_chat


# Primary, versioned API router (what should appear in OpenAPI).
api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router, tags=["auth"])
api_v1_router.include_router(public_catalog.router, tags=["catalog"])
api_v1_router.include_router(public_catalog.legacy_router, tags=["catalog"], include_in_schema=False)
api_v1_router.include_router(shipping.router, tags=["shipping"])
api_v1_router.include_router(shipping.legacy_router, tags=["shipping"], include_in_schema=False)
api_v1_router.include_router(orders.router, tags=["orders"])
api_v1_router.include_router(coupons.router, tags=["coupons"])
api_v1_router.include_router(coupons.legacy_router, tags=["coupons"], include_in_schema=False)
api_v1_router.include_router(coupons.admin_router, tags=["admin"])
api_v1_router.include_router(addresses.router, tags=["addresses"])
api_v1_router.include_router(favorites.router, tags=["favorites"])
api_v1_router.include_router(admin_access.router, tags=["admin"])
api_v1_router.include_router(admin_catalog.router, tags=["admin"])
api_v1_router.include_router(support_chat.router, tags=["support"])
api_v1_router.include_router(support_chat.legacy_router, tags=["support"], include_in_schema=False)


# Legacy (unversioned) API router for minimal backwards compatibility.
#
# Notes:
# - It is excluded from OpenAPI to avoid duplicated endpoints in Swagger.
# - Keep this temporarily; remove when all clients migrate to /api/v1.
legacy_router = APIRouter()
legacy_router.include_router(auth.router, tags=["auth"], include_in_schema=False)
legacy_router.include_router(public_catalog.legacy_router, tags=["catalog"], include_in_schema=False)
legacy_router.include_router(shipping.legacy_router, tags=["shipping"], include_in_schema=False)
legacy_router.include_router(orders.router, tags=["orders"], include_in_schema=False)
legacy_router.include_router(coupons.legacy_router, tags=["coupons"], include_in_schema=False)
legacy_router.include_router(coupons.admin_router, tags=["admin"], include_in_schema=False)
legacy_router.include_router(addresses.router, tags=["addresses"], include_in_schema=False)
legacy_router.include_router(favorites.router, tags=["favorites"], include_in_schema=False)
legacy_router.include_router(admin_access.router, tags=["admin"], include_in_schema=False)
legacy_router.include_router(admin_catalog.router, tags=["admin"], include_in_schema=False)
legacy_router.include_router(support_chat.legacy_router, tags=["support"], include_in_schema=False)


# Non-API (HTML/SSR) routes.
pages_router = pages.router
