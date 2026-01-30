# Loja virtual multi-tenant (3 lojas) — Front preparado, 1 implementado agora

## Contexto
- Backend: FastAPI + MySQL (shared DB) com isolamento por `store_id`.
- Lojas previstas no backend: `roupas`, `relogios`, `agro`.
- Front atual (site + app) implementado **fixo** em `roupas`, mas preparado para duplicação.

---

## 1) Como subir backend + banco (MySQL)

### Via Docker (recomendado)
Na raiz do repositório:

```bash
cp backend/.env.example backend/.env
docker compose -f docker-compose.dev.yml --env-file backend/.env up -d --build
```

- API: http://localhost:8000
- MySQL: localhost:3306

### Local (sem Docker)

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> Ajuste `DATABASE_URL` em `backend/.env` conforme seu MySQL.

## 2) Como rodar migrations

### Com Docker

```bash
docker compose -f docker-compose.dev.yml --env-file backend/.env exec api alembic upgrade head
```

### Local

```bash
cd backend
alembic upgrade head
```

## 3) Como garantir que existem 3 lojas (`roupas`, `relogios`, `agro`)

As migrações incluem um seed idempotente (migration `0005_seed_core_stores`) que garante as 3 lojas.

Checagem rápida (MySQL):

```sql
SELECT id, slug, is_active FROM stores WHERE slug IN ('roupas','relogios','agro');
```

## 4) Como rodar testes (anti-vazamento)

Os testes validam o isolamento entre lojas (404 em acesso cross-store e listagens sem vazamento).

```bash
cd backend
pip install -r requirements-dev.txt
pytest -q
```

## Backend (contexto da loja)
- Rotas públicas preferenciais (path-based):
  - Catálogo: `GET /api/v1/public/{store_slug}/categories`
  - Produtos: `GET /api/v1/public/{store_slug}/products`
  - Produto: `GET /api/v1/public/{store_slug}/products/{product_id}`
  - Cupom: `POST /api/v1/public/{store_slug}/coupons/validate`
  - Frete: `POST /api/v1/public/{store_slug}/shipping/quote`

> Observação: como existem 3 lojas ativas, endpoints legados que não recebem loja (`store_id`/`store_slug`) podem retornar erro (store context required).

## 5) Frontend (1 front agora, preparado para 3)

### Site
- Rodar o site atual (fixo em `roupas`):
  - Abra `web_site/index.html` (ou sirva via um servidor simples).
  - Configuração:
    - `web_site/assets/js/config.js`: `STORE_SLUG` e `API_BASE_URL`.

- Para criar os outros 2 sites no futuro:
  1) Duplique a pasta `web_site/`.
  2) Troque apenas `STORE_SLUG` para `relogios` e `agro` (e, se necessário, `API_BASE_URL`).

### Flutter
- Rodar o app atual (fixo em `roupas` por `--dart-define`):

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:8000 \
  --dart-define=STORE_SLUG=roupas
```

- Configuração:
  - `lib/core/config/app_config.dart`: lê `STORE_SLUG`, `API_BASE_URL` e `USE_MOCK_DATA` via `--dart-define`.

- Para preparar no futuro 3 builds (flavors):
  - Crie 3 flavors (roupas/relogios/agro) e mantenha como única diferença o `STORE_SLUG`.

- Importante: garanta que o mock está desativado ao usar API real (`USE_MOCK_DATA=false`).
