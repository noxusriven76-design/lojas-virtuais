from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4


BACKEND_DIR = Path(__file__).resolve().parents[1]
API_BASE = "http://127.0.0.1:8001"
DB_FILE = BACKEND_DIR / "_audit_admin.sqlite3"
RUNTIME_DIR = BACKEND_DIR / ".audit_runtime"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@dataclass
class Result:
    check: str
    method: str
    path: str
    status: int
    ok: bool
    detail: str = ""


class AuditError(RuntimeError):
    pass


def _json_dumps(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False).encode("utf-8")


def _multipart_body(field_name: str, filename: str, content: bytes, content_type: str) -> tuple[bytes, str]:
    boundary = f"----audit-{uuid4().hex}"
    lines = [
        f"--{boundary}".encode("utf-8"),
        (
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"'
        ).encode("utf-8"),
        f"Content-Type: {content_type}".encode("utf-8"),
        b"",
        content,
        f"--{boundary}--".encode("utf-8"),
        b"",
    ]
    body = b"\r\n".join(lines)
    return body, boundary


def request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    json_body: dict[str, Any] | None = None,
    form_body: dict[str, Any] | None = None,
    file_body: tuple[str, str, bytes, str] | None = None,
) -> tuple[int, str]:
    headers: dict[str, str] = {}
    data: bytes | None = None
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if json_body is not None:
        data = _json_dumps(json_body)
        headers["Content-Type"] = "application/json"
    elif form_body is not None:
        data = urllib.parse.urlencode(form_body).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif file_body is not None:
        field, filename, content, content_type = file_body
        data, boundary = _multipart_body(field, filename, content, content_type)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

    req = urllib.request.Request(f"{API_BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.getcode(), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", errors="replace")


def parse_json(body: str) -> Any:
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def run_audit() -> tuple[list[Result], int]:
    results: list[Result] = []

    def check(
        name: str,
        method: str,
        path: str,
        *,
        expected: int,
        token: str | None = None,
        json_body: dict[str, Any] | None = None,
        form_body: dict[str, Any] | None = None,
        file_body: tuple[str, str, bytes, str] | None = None,
        validator=None,
    ) -> Any:
        status, body = request(
            method,
            path,
            token=token,
            json_body=json_body,
            form_body=form_body,
            file_body=file_body,
        )
        payload = parse_json(body)
        ok = status == expected
        detail = ""
        if ok and validator:
            try:
                validator(payload)
            except Exception as exc:  # noqa: BLE001
                ok = False
                detail = str(exc)
        if not ok and not detail:
            detail = body[:180].replace("\n", " ")
        results.append(Result(name, method, path, status, ok, detail))
        return payload

    suffix = uuid4().hex[:8]

    # Health + auth
    check("health", "GET", "/health", expected=200, validator=lambda p: p and p.get("status") == "ok")

    login_payload = check(
        "auth.login.superuser",
        "POST",
        "/api/v1/auth/login",
        expected=200,
        form_body={"username": "admin@local.com", "password": "admin123"},
        validator=lambda p: p and p.get("access_token"),
    )
    if not (isinstance(login_payload, dict) and login_payload.get("access_token")):
        raise AuditError("Falha ao autenticar com superuser bootstrap")
    su_token = login_payload["access_token"]

    check("auth.me", "GET", "/api/v1/auth/me", expected=200, token=su_token)

    stores_payload = check(
        "admin.my-stores",
        "GET",
        "/api/v1/admin/my-stores",
        expected=200,
        token=su_token,
        validator=lambda p: isinstance(p, list) and len(p) >= 3,
    )
    if not isinstance(stores_payload, list):
        raise AuditError("Falha ao listar lojas")
    stores_by_slug = {row["slug"]: row for row in stores_payload if isinstance(row, dict) and "slug" in row}
    for slug in ("roupas", "relogios", "agro"):
        if slug not in stores_by_slug:
            raise AuditError(f"Loja seed ausente no runtime: {slug}")
    store_a = int(stores_by_slug["roupas"]["store_id"])
    store_b = int(stores_by_slug["relogios"]["store_id"])

    # Admin stores
    check("admin.stores.list", "GET", "/api/v1/admin/stores", expected=200, token=su_token)
    new_store_payload = check(
        "admin.stores.create",
        "POST",
        "/api/v1/admin/stores",
        expected=200,
        token=su_token,
        json_body={"name": f"Audit Store {suffix}", "slug": f"audit-{suffix}"},
        validator=lambda p: p and p.get("id"),
    )
    new_store_id = int(new_store_payload["id"])
    check(
        "admin.stores.update",
        "PATCH",
        f"/api/v1/admin/stores/{new_store_id}",
        expected=200,
        token=su_token,
        json_body={"name": f"Audit Store Updated {suffix}", "is_active": False},
    )

    # User + member management
    member_email = f"member-{suffix}@local.com"
    member_payload = check(
        "auth.register.member",
        "POST",
        "/api/v1/auth/register",
        expected=200,
        json_body={"email": member_email, "password": "123456", "name": "Member User"},
        validator=lambda p: p and p.get("id"),
    )
    member_id = int(member_payload["id"])
    check(
        "admin.members.add",
        "POST",
        f"/api/v1/admin/stores/{new_store_id}/members",
        expected=200,
        token=su_token,
        json_body={"user_id": member_id, "role": "viewer"},
    )
    check("admin.members.list", "GET", f"/api/v1/admin/stores/{new_store_id}/members", expected=200, token=su_token)
    check(
        "admin.members.remove",
        "DELETE",
        f"/api/v1/admin/stores/{new_store_id}/members/{member_id}",
        expected=200,
        token=su_token,
    )

    # Categories
    cat_a_payload = check(
        "admin.categories.create.storeA",
        "POST",
        f"/api/v1/admin/stores/{store_a}/categories",
        expected=200,
        token=su_token,
        json_body={"name": f"Audit Cat {suffix}"},
    )
    cat_a_id = int(cat_a_payload["id"])
    check("admin.categories.list.storeA", "GET", f"/api/v1/admin/stores/{store_a}/categories", expected=200, token=su_token)
    cats_b_payload = check(
        "admin.categories.list.storeB",
        "GET",
        f"/api/v1/admin/stores/{store_b}/categories",
        expected=200,
        token=su_token,
    )
    if isinstance(cats_b_payload, list) and any(isinstance(c, dict) and c.get("id") == cat_a_id for c in cats_b_payload):
        results.append(
            Result(
                "admin.categories.isolation.A_not_in_B",
                "GET",
                f"/api/v1/admin/stores/{store_b}/categories",
                200,
                False,
                "Categoria da store A apareceu na store B",
            )
        )
    else:
        results.append(
            Result(
                "admin.categories.isolation.A_not_in_B",
                "GET",
                f"/api/v1/admin/stores/{store_b}/categories",
                200,
                True,
                "",
            )
        )
    check(
        "admin.categories.update",
        "PATCH",
        f"/api/v1/admin/stores/{store_a}/categories/{cat_a_id}",
        expected=200,
        token=su_token,
        json_body={"name": f"Audit Cat Updated {suffix}"},
    )

    # Products + variants
    product_payload = check(
        "admin.products.create.storeA",
        "POST",
        f"/api/v1/admin/stores/{store_a}/products",
        expected=200,
        token=su_token,
        json_body={"category_id": cat_a_id, "name": f"Audit Product {suffix}", "base_price": 19.9, "is_active": True},
    )
    product_id = int(product_payload["id"])
    products_a_payload = check(
        "admin.products.list.storeA", "GET", f"/api/v1/admin/stores/{store_a}/products", expected=200, token=su_token
    )
    products_b_payload = check(
        "admin.products.list.storeB", "GET", f"/api/v1/admin/stores/{store_b}/products", expected=200, token=su_token
    )
    if isinstance(products_a_payload, list) and not any(
        isinstance(p, dict) and p.get("id") == product_id for p in products_a_payload
    ):
        results.append(
            Result(
                "admin.products.create.visible_in_A",
                "GET",
                f"/api/v1/admin/stores/{store_a}/products",
                200,
                False,
                "Produto criado nao apareceu na store A",
            )
        )
    else:
        results.append(
            Result("admin.products.create.visible_in_A", "GET", f"/api/v1/admin/stores/{store_a}/products", 200, True, "")
        )
    if isinstance(products_b_payload, list) and any(
        isinstance(p, dict) and p.get("id") == product_id for p in products_b_payload
    ):
        results.append(
            Result(
                "admin.products.isolation.A_not_in_B",
                "GET",
                f"/api/v1/admin/stores/{store_b}/products",
                200,
                False,
                "Produto da store A apareceu na store B",
            )
        )
    else:
        results.append(
            Result("admin.products.isolation.A_not_in_B", "GET", f"/api/v1/admin/stores/{store_b}/products", 200, True, "")
        )

    check(
        "admin.products.update",
        "PATCH",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}",
        expected=200,
        token=su_token,
        json_body={"price": 25.4, "description": "Audit update"},
    )
    variant_payload = check(
        "admin.variants.create",
        "POST",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}/variants",
        expected=200,
        token=su_token,
        json_body={"sku": f"AUD-{suffix}", "price": 25.4, "stock": 8, "color": "preto", "size": "U", "active": True},
    )
    variant_id = int(variant_payload["id"])

    # Product image endpoints
    fake_jpg = b"\xff\xd8\xff\xdbFAKEJPEGDATA\xff\xd9"
    check(
        "admin.product.cover.upload",
        "POST",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}/image",
        expected=200,
        token=su_token,
        file_body=("file", "cover.jpg", fake_jpg, "image/jpeg"),
    )
    gallery_one_payload = check(
        "admin.product.gallery.upload",
        "POST",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}/images",
        expected=200,
        token=su_token,
        file_body=("file", "gallery1.jpg", fake_jpg, "image/jpeg"),
    )
    image_id = int(gallery_one_payload["id"])
    check(
        "admin.product.gallery.list",
        "GET",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}/images",
        expected=200,
        token=su_token,
    )
    check(
        "admin.product.gallery.update",
        "PATCH",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}/images/{image_id}",
        expected=200,
        token=su_token,
        json_body={"is_cover": True},
    )
    check(
        "admin.product.gallery.delete",
        "DELETE",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}/images/{image_id}",
        expected=200,
        token=su_token,
    )
    check(
        "admin.product.cover.delete",
        "DELETE",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}/image",
        expected=200,
        token=su_token,
    )

    # Store logo endpoints
    check(
        "admin.store.logo.upload",
        "POST",
        f"/api/v1/admin/stores/{store_a}/logo",
        expected=200,
        token=su_token,
        file_body=("file", "logo.webp", b"RIFFFAKEWEBP", "image/webp"),
    )
    check(
        "admin.store.logo.delete",
        "DELETE",
        f"/api/v1/admin/stores/{store_a}/logo",
        expected=200,
        token=su_token,
    )

    # Content endpoints + isolation
    check("admin.content.get.storeA", "GET", f"/api/v1/admin/stores/{store_a}/content", expected=200, token=su_token)
    check(
        "admin.content.update.storeA",
        "PATCH",
        f"/api/v1/admin/stores/{store_a}/content",
        expected=200,
        token=su_token,
        json_body={"banner_title": f"Banner Audit {suffix}"},
    )
    content_b = check(
        "admin.content.get.storeB",
        "GET",
        f"/api/v1/admin/stores/{store_b}/content",
        expected=200,
        token=su_token,
    )
    if isinstance(content_b, dict) and content_b.get("banner_title") == f"Banner Audit {suffix}":
        results.append(
            Result(
                "admin.content.isolation.A_not_in_B",
                "GET",
                f"/api/v1/admin/stores/{store_b}/content",
                200,
                False,
                "Conteudo alterado na store A vazou para store B",
            )
        )
    else:
        results.append(
            Result("admin.content.isolation.A_not_in_B", "GET", f"/api/v1/admin/stores/{store_b}/content", 200, True, "")
        )
    check(
        "admin.content.banner.upload",
        "POST",
        f"/api/v1/admin/stores/{store_a}/content/banner-image",
        expected=200,
        token=su_token,
        file_body=("file", "banner.png", b"\x89PNGFAKE", "image/png"),
    )
    check(
        "admin.content.banner.delete",
        "DELETE",
        f"/api/v1/admin/stores/{store_a}/content/banner-image",
        expected=200,
        token=su_token,
    )

    # Coupon endpoints + isolation
    coupon_payload = check(
        "admin.coupon.create",
        "POST",
        f"/api/v1/admin/stores/{store_a}/coupons",
        expected=200,
        token=su_token,
        json_body={"code": f"AUD{suffix[:4]}", "kind": "percent", "percent": 10, "amount": 0, "active": True},
    )
    coupon_id = int(coupon_payload["id"])
    coupon_code = str(coupon_payload["code"])
    check(
        "public.coupon.validate.storeA",
        "POST",
        f"/api/v1/public/roupas/coupons/validate",
        expected=200,
        json_body={"code": coupon_code, "subtotal": 100},
        validator=lambda p: p and p.get("valid") is True,
    )
    check(
        "public.coupon.validate.storeB",
        "POST",
        f"/api/v1/public/relogios/coupons/validate",
        expected=200,
        json_body={"code": coupon_code, "subtotal": 100},
        validator=lambda p: p and p.get("valid") is False and p.get("reason") == "not_found",
    )
    check(
        "admin.coupon.update",
        "PUT",
        f"/api/v1/admin/stores/{store_a}/coupons/{coupon_id}",
        expected=200,
        token=su_token,
        json_body={"percent": 12},
    )
    check(
        "admin.coupon.deactivate",
        "POST",
        f"/api/v1/admin/stores/{store_a}/coupons/{coupon_id}/deactivate",
        expected=200,
        token=su_token,
    )

    # Orders and customers (runtime data)
    buyer_email = f"buyer-{suffix}@local.com"
    check(
        "auth.register.buyer",
        "POST",
        "/api/v1/auth/register",
        expected=200,
        json_body={"email": buyer_email, "password": "123456", "name": "Buyer User"},
    )
    buyer_login = check(
        "auth.login.buyer",
        "POST",
        "/api/v1/auth/login",
        expected=200,
        form_body={"username": buyer_email, "password": "123456"},
    )
    buyer_token = buyer_login["access_token"]
    order_payload = check(
        "orders.create.public",
        "POST",
        "/api/v1/orders",
        expected=200,
        token=buyer_token,
        json_body={
            "store_slug": "roupas",
            "items": [{"product_id": product_id, "variant_id": variant_id, "quantity": 1}],
            "shipping_service": "normal",
            "shipping_price": 5.0,
            "shipping_eta_days": 5,
            "address": {
                "recipient_name": "Buyer User",
                "phone": "11999999999",
                "cep": "01001000",
                "street": "Rua Teste",
                "number": "123",
                "complement": "",
                "neighborhood": "Centro",
                "city": "Sao Paulo",
                "state": "SP",
            },
        },
    )
    order_id = int(order_payload["id"])
    check("admin.orders.list", "GET", f"/api/v1/admin/stores/{store_a}/orders", expected=200, token=su_token)
    check(
        "admin.orders.detail",
        "GET",
        f"/api/v1/admin/stores/{store_a}/orders/{order_id}",
        expected=200,
        token=su_token,
    )
    check(
        "admin.orders.status.update",
        "PATCH",
        f"/api/v1/admin/stores/{store_a}/orders/{order_id}/status",
        expected=200,
        token=su_token,
        json_body={"status": "paid"},
    )
    check("admin.customers.list", "GET", f"/api/v1/admin/stores/{store_a}/customers", expected=200, token=su_token)

    # Security checks
    check(
        "security.superuser_only.stores_list",
        "GET",
        "/api/v1/admin/stores",
        expected=403,
        token=buyer_token,
    )
    check(
        "security.non_member.forbidden_store",
        "GET",
        f"/api/v1/admin/stores/{store_a}/categories",
        expected=403,
        token=buyer_token,
    )

    # Product/category delete behavior after order history
    delete_product_payload = check(
        "admin.products.delete.soft_with_history",
        "DELETE",
        f"/api/v1/admin/stores/{store_a}/products/{product_id}",
        expected=200,
        token=su_token,
    )
    if isinstance(delete_product_payload, dict) and delete_product_payload.get("mode") != "soft_delete":
        results.append(
            Result(
                "admin.products.delete.mode.soft_delete",
                "DELETE",
                f"/api/v1/admin/stores/{store_a}/products/{product_id}",
                200,
                False,
                f"mode retornado: {delete_product_payload.get('mode')}",
            )
        )
    else:
        results.append(
            Result(
                "admin.products.delete.mode.soft_delete",
                "DELETE",
                f"/api/v1/admin/stores/{store_a}/products/{product_id}",
                200,
                True,
                "",
            )
        )
    check(
        "admin.categories.delete.conflict_linked_products",
        "DELETE",
        f"/api/v1/admin/stores/{store_a}/categories/{cat_a_id}",
        expected=409,
        token=su_token,
    )

    failures = sum(1 for r in results if not r.ok)
    return results, failures


def bootstrap_sqlite() -> None:
    if DB_FILE.exists():
        DB_FILE.unlink()
    os.environ["ENV"] = "dev"
    os.environ["DEBUG"] = "false"
    os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{DB_FILE.as_posix()}"
    os.environ["JWT_SECRET_KEY"] = "audit-secret"
    os.environ["JWT_ALGORITHM"] = "HS256"
    os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.db.base import Base
    import app.models  # noqa: F401
    from app.db.bootstrap import bootstrap

    engine = create_engine(os.environ["DATABASE_URL"], future=True)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        bootstrap(db)


def wait_for_health(timeout_seconds: int = 30) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        status, _ = request("GET", "/health")
        if status == 200:
            return
        time.sleep(0.4)
    raise AuditError("API nao respondeu /health no prazo")


def main() -> int:
    os.chdir(BACKEND_DIR)
    bootstrap_sqlite()

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    runtime_env_file = RUNTIME_DIR / ".env"
    runtime_env_file.write_text(
        "\n".join(
            [
                "APP_NAME=Loja Platform API (audit)",
                "ENV=dev",
                "DEBUG=false",
                f"DATABASE_URL=sqlite+pysqlite:///{DB_FILE.as_posix()}",
                "JWT_SECRET_KEY=audit-secret",
                "JWT_ALGORITHM=HS256",
                "ACCESS_TOKEN_EXPIRE_MINUTES=60",
                "CORS_ORIGINS=http://localhost:5173",
                "UPLOADS_DIR=./uploads",
                "UPLOADS_BASE_URL=/static/uploads",
                "UPLOADS_MAX_SIZE_BYTES=5242880",
                "",
            ]
        ),
        encoding="utf-8",
    )

    env = os.environ.copy()
    current_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(BACKEND_DIR) if not current_pythonpath else f"{BACKEND_DIR};{current_pythonpath}"
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"],
        cwd=str(RUNTIME_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_health()
        results, failures = run_audit()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()

    print("# Auditoria Pratica de Endpoints Admin")
    print()
    print("| Check | Metodo | Endpoint | HTTP | Resultado | Detalhe |")
    print("|---|---|---|---:|---|---|")
    for r in results:
        print(
            f"| {r.check} | {r.method} | `{r.path}` | {r.status} | {'OK' if r.ok else 'FALHA'} | {r.detail or '-'} |"
        )

    total = len(results)
    ok_count = total - failures
    print()
    print(f"Resumo: {ok_count}/{total} checks OK; {failures} falhas.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
