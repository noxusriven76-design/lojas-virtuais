from __future__ import annotations

from pathlib import Path
import re
import unicodedata
import hashlib

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.repositories.catalog import list_categories
from app.repositories.utils import resolve_store

router = APIRouter()

templates = Jinja2Templates(directory="app/templates")
_BASE_DIR = Path(__file__).resolve().parents[2]
_SITE_ASSETS_DIR = _BASE_DIR / "static" / "site_assets"


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    ascii_only = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    return slug or "categoria"


def _build_nav_categories(db: Session, store_id: int) -> list[dict[str, str]]:
    used: set[str] = set()
    items: list[dict[str, str]] = []
    for category in list_categories(db, store_id=store_id):
        name = str(category.name or "").strip()
        if not name:
            continue
        base = _slugify(name)
        slug = base
        suffix = 2
        while slug in used:
            slug = f"{base}-{suffix}"
            suffix += 1
        used.add(slug)
        items.append({"name": name, "slug": slug})
    return items


def _theme_for_store_slug(store_slug: str) -> str:
    normalized = store_slug.lower()
    if "agro" in normalized:
        return "agro"
    if "relogio" in normalized:
        return "relogios"
    return "roupas"


def _mirror_template_for_theme(theme: str, page: str) -> str:
    if theme == "agro":
        return f"site/mirror_agro_{page}.html"
    if theme == "relogios":
        return f"site/mirror_relogios_{page}.html"
    return f"site/mirror_roupas_{page}.html"


def _asset_version_for_theme(theme: str) -> str:
    theme_dir = (_SITE_ASSETS_DIR / theme).resolve()
    css_file = theme_dir / "assets" / "css" / "styles.css"
    js_dir = theme_dir / "assets" / "js"
    hasher = hashlib.sha1()
    for p in (css_file,):
        if p.is_file():
            st = p.stat()
            hasher.update(str(st.st_mtime_ns).encode("utf-8"))
            hasher.update(str(st.st_size).encode("utf-8"))
    if js_dir.is_dir():
        for p in sorted(js_dir.rglob("*.js")):
            st = p.stat()
            hasher.update(str(st.st_mtime_ns).encode("utf-8"))
            hasher.update(str(st.st_size).encode("utf-8"))
    return hasher.hexdigest()[:12] or "dev"


@router.get("/site/{store_slug}")
def store_home(store_slug: str, request: Request, db: Session = Depends(get_db)):
    store = resolve_store(db, store_slug=store_slug)
    theme = _theme_for_store_slug(store.slug)
    nav_categories = _build_nav_categories(db, store.id)
    asset_v = _asset_version_for_theme(theme)
    return templates.TemplateResponse(
        _mirror_template_for_theme(theme, "index"),
        {
            "request": request,
            "store": store,
            "nav_categories": nav_categories,
            "asset_v": asset_v,
        },
    )


def _render_mirror_page(store_slug: str, page: str, request: Request, db: Session):
    store = resolve_store(db, store_slug=store_slug)
    theme = _theme_for_store_slug(store.slug)
    nav_categories = _build_nav_categories(db, store.id)
    asset_v = _asset_version_for_theme(theme)
    return templates.TemplateResponse(
        _mirror_template_for_theme(theme, page),
        {
            "request": request,
            "store": store,
            "nav_categories": nav_categories,
            "asset_v": asset_v,
        },
    )


@router.get("/site/{store_slug}/index.html")
def store_home_html(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "index", request, db)


@router.get("/site/{store_slug}/category")
def store_category(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "category", request, db)


@router.get("/site/{store_slug}/category.html")
def store_category_html(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "category", request, db)


@router.get("/site/{store_slug}/product.html")
def store_product_html(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "product", request, db)


@router.get("/site/{store_slug}/cart")
def store_cart(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "cart", request, db)


@router.get("/site/{store_slug}/cart.html")
def store_cart_html(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "cart", request, db)


@router.get("/site/{store_slug}/checkout")
def store_checkout(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "checkout", request, db)


@router.get("/site/{store_slug}/checkout.html")
def store_checkout_html(store_slug: str, request: Request, db: Session = Depends(get_db)):
    return _render_mirror_page(store_slug, "checkout", request, db)


@router.get("/site/{store_slug}/assets/{asset_path:path}")
def store_asset(store_slug: str, asset_path: str, db: Session = Depends(get_db)):
    store = resolve_store(db, store_slug=store_slug)
    theme = _theme_for_store_slug(store.slug)
    base_dir = (_SITE_ASSETS_DIR / theme / "assets").resolve()
    file_path = (base_dir / asset_path).resolve()

    if not str(file_path).startswith(str(base_dir)):
        raise HTTPException(status_code=404)
    if not file_path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(
        path=file_path,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/admin")
def admin_home(request: Request):
    return templates.TemplateResponse("admin/index.html", {"request": request})
