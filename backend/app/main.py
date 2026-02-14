from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from app.api.router import api_v1_router, legacy_router, pages_router
from app.core.config import settings
from app.core.uploads import ensure_upload_base_dirs
from app.db.session import SessionLocal
from app.db.bootstrap import bootstrap
from app.repositories.utils import StoreContextRequiredError

app = FastAPI(title=settings.app_name, debug=settings.debug)

logger = logging.getLogger("app")


def _error_payload(*, code: str, message: str, request_id: str | None, details=None) -> dict:
    payload: dict = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
        }
    }
    if details is not None:
        payload["error"]["details"] = details
    return payload


@app.middleware("http")
async def request_id_and_logging_middleware(request: Request, call_next):
    # Headers are case-insensitive, but keep a single canonical name.
    request_id = request.headers.get("x-request-id")
    if not request_id:
        request_id = uuid.uuid4().hex
    request.state.request_id = request_id

    started = time.perf_counter()
    response = None
    try:
        response = await call_next(request)
    except Exception:
        # Let exception handlers build the response, but emit an error log with correlation id.
        logger.exception(
            "Unhandled exception while handling request",
            extra={"request_id": request_id, "path": str(request.url.path), "method": request.method},
        )
        raise
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        status_code = getattr(response, "status_code", None)
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            status_code,
            elapsed_ms,
            extra={"request_id": request_id},
        )

    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", None)
    detail = exc.detail
    if isinstance(detail, str):
        message = detail
        details = None
    else:
        message = "Request failed"
        details = detail

    logger.warning(
        "HTTPException %s: %s",
        exc.status_code,
        message,
        extra={"request_id": request_id, "path": str(request.url.path), "method": request.method},
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(code="http_error", message=message, request_id=request_id, details=details),
        headers={"X-Request-Id": request_id} if request_id else None,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None)
    logger.info(
        "Validation error",
        extra={"request_id": request_id, "path": str(request.url.path), "method": request.method},
    )
    return JSONResponse(
        status_code=400,
        content=_error_payload(
            code="validation_error",
            message="Validation failed",
            request_id=request_id,
            details=exc.errors(),
        ),
        headers={"X-Request-Id": request_id} if request_id else None,
    )


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    request_id = getattr(request.state, "request_id", None)
    logger.warning(
        "Integrity error",
        extra={"request_id": request_id, "path": str(request.url.path), "method": request.method},
    )
    return JSONResponse(
        status_code=409,
        content=_error_payload(
            code="integrity_error",
            message="Integrity constraint violation",
            request_id=request_id,
        ),
        headers={"X-Request-Id": request_id} if request_id else None,
    )


@app.exception_handler(StoreContextRequiredError)
async def store_context_required_handler(request: Request, exc: StoreContextRequiredError):
    request_id = getattr(request.state, "request_id", None)
    logger.info(
        "Store context required",
        extra={"request_id": request_id, "path": str(request.url.path), "method": request.method},
    )
    return JSONResponse(
        status_code=400,
        content=_error_payload(
            code="store_context_required",
            message=str(exc),
            request_id=request_id,
        ),
        headers={"X-Request-Id": request_id} if request_id else None,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "Unhandled exception",
        extra={"request_id": request_id, "path": str(request.url.path), "method": request.method},
    )
    return JSONResponse(
        status_code=500,
        content=_error_payload(
            code="internal_error",
            message="Internal server error",
            request_id=request_id,
        ),
        headers={"X-Request-Id": request_id} if request_id else None,
    )


def _configure_logging() -> None:
    # Keep it minimal: leverage stdlib logging and let uvicorn configure handlers.
    level = logging.DEBUG if settings.debug else logging.INFO
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    root.setLevel(level)
    logger.setLevel(level)

# CORS (dev-friendly default for local dashboard)
origins = [o.strip() for o in (settings.cors_origins or "").split(",") if o.strip()]
if not origins and settings.env in ("dev", "local"):
    origins = ["http://localhost:5173"]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-Id"],
    )

# Public, versioned API (preferred)
app.include_router(api_v1_router)

# Legacy, unversioned API (deprecated; excluded from OpenAPI)
app.include_router(legacy_router)

# HTML/SSR pages (non-API). Keep out of OpenAPI.
app.include_router(pages_router, include_in_schema=False)

# Static uploads (local filesystem)
Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
app.mount(settings.uploads_base_url, StaticFiles(directory=settings.uploads_dir, check_dir=False), name="uploads")
app.mount("/site-assets", StaticFiles(directory="app/static/site_assets", check_dir=False), name="site-assets")


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok"}


@app.on_event("startup")
def on_startup():
    _configure_logging()
    logger.info("Starting API", extra={"env": settings.env, "debug": settings.debug})
    ensure_upload_base_dirs()
    # Development bootstrap: creates admin@local / admin123 and one sample store.
    if settings.env in ("dev", "local"):
        db = SessionLocal()
        try:
            bootstrap(db)
        finally:
            db.close()
        logger.info("Development bootstrap completed")
