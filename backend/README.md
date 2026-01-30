# Loja Platform (FastAPI + MySQL) - Scaffold

Este projeto é um **backend único** (modular monolith) para:
- App Flutter
- Site em HTML (SSR inicial via Jinja2)
- Painel Master (você)
- Painel do Lojista (multi-loja / multi-tenant)

Foco em funcionalidade e escalabilidade incremental.

## Higiene do repositório (produção)
Se você recebeu o projeto com artefatos locais (cache/IDE/build), rode:
```bash
./scripts/cleanup_repo_hygiene.sh
```

Isso remove caches e garante que arquivos `.env` permaneçam locais (use sempre `backend/.env.example` como base).

## 1) Subir o MySQL (Docker)
```bash
# A partir da raiz do repositório:
cp backend/.env.example backend/.env

docker compose -f docker-compose.dev.yml --env-file backend/.env up -d --build
```

Isso sobe:
- API: http://localhost:8000
- MySQL: localhost:3306

### Rodar migrations (DEV)
```bash
docker compose -f docker-compose.dev.yml --env-file backend/.env exec api alembic upgrade head
```

## 2) `.env` local (sem Docker)
Copie o exemplo do backend:
```bash
cp backend/.env.example backend/.env
```

> Importante: `backend/.env` é **somente local** e nunca deve ser commitado.
> Se ele apareceu como "tracked" em algum momento, remova do índice do Git:
```bash
git rm --cached backend/.env
```

Edite `DATABASE_URL` se necessário.

## 3) Instalar dependências
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 4) Rodar migrations
```bash
alembic upgrade head
```

### Notas de multi-loja (shared DB + store_id)
- Índices compostos por `store_id` foram adicionados para melhorar listagens/consultas por loja.
- `product_variants.sku` passou a ser **único por loja** (`UNIQUE(store_id, sku)`).
- `support_messages` agora possui `store_id NOT NULL` (backfill automático via `support_conversations`).


### Contrato de erros (API)
A API retorna **sempre** o mesmo envelope de erro:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed",
    "request_id": "6f2c0c3d0d9e4f7e9d7c8e0d0f9a1234",
    "details": []
  }
}
```

- `error.message`: mensagem amigável para exibir no app/site.
- `error.code`: código estável para lógica (telemetria, tratamento específico, etc.).
- `error.request_id`: id de correlação (também no header `X-Request-Id`) — útil para suporte.
- `error.details`: opcional (ex.: erros de validação do Pydantic).

**Status HTTP (consistência):**
- **400**: validação / payload inválido (inclui `RequestValidationError`)
- **401/403**: autenticação/autorização
- **404**: recurso **não existe na loja** (anti-vazamento multi-tenant)
- **409**: violação de integridade (unique, FK, etc.)
- **500**: erro interno

> Observação: endpoints podem retornar 404 mesmo quando um `id` existe em outra loja — isso é intencional para evitar vazamento.
## 5) Rodar API (acessível na rede)
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Usuário master (dev)
No `ENV=dev`, o startup cria:
- email: `admin@local`
- senha: `admin123`
 - stores iniciais:
   - `roupas`
   - `relogios`
   - `agro`

## 6) Endpoints para o Flutter (API versionada)

Base URL (DEV): `http://localhost:8000/api/v1`

Catálogo público (store no path):
- `GET /api/v1/public/{store_slug}/categories`
- `GET /api/v1/public/{store_slug}/products`
- `GET /api/v1/public/{store_slug}/products/{id}`
- `POST /api/v1/auth/login` (OAuth2 form)
- `GET /api/v1/auth/me`
- `POST /api/v1/public/{store_slug}/shipping/quote`
- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/addresses`
- `GET /api/v1/favorites`

### Compatibilidade (deprecated)
Por um período curto, os mesmos endpoints **sem** `/api/v1` continuam funcionando (por ex.: `GET /categories`).
Eles estão **fora do OpenAPI/Swagger** e devem ser tratados como **deprecated**.

## 7) Multi-loja (master)
Requer token de superuser:
- `GET /api/v1/master/stores`
- `POST /api/v1/master/stores`
- `POST /api/v1/master/stores/{store_id}/members`

## 8) Painel / Admin do lojista (MVP)
Requer que o usuário seja membro da loja:
- `GET /api/v1/admin/stores/{store_id}/categories`
- `POST /api/v1/admin/stores/{store_id}/categories`
- `GET /api/v1/admin/stores/{store_id}/products`
- `POST /api/v1/admin/stores/{store_id}/products`
- `POST /api/v1/admin/stores/{store_id}/products/{product_id}/variants`

## 9) Site HTML SSR (MVP)
- `GET /site/{store_slug}`
- `GET /site/{store_slug}/p/{product_id}`



## Cupons de desconto

### Migração (MySQL)
1. Rode as migrações:
```bash
cd backend
alembic upgrade head
```

### Endpoints

#### Admin (lojista/manager)
- **POST** `/api/v1/admin/stores/{store_id}/coupons`  
- **PUT** `/api/v1/admin/stores/{store_id}/coupons/{coupon_id}`  
- **POST** `/api/v1/admin/stores/{store_id}/coupons/{coupon_id}/deactivate`

> Requer permissão de **owner/manager** (ou superuser).

#### Checkout (validação no backend)
 - **POST** `/api/v1/public/{store_slug}/coupons/validate`

Payload:
```json
{
  "code": "WELCOME10",
  "subtotal": 299.90
}
```

Resposta:
- `valid=true` e `discount` calculado pelo backend
- ou `valid=false` com `reason` (ex.: `expired`, `usage_limit_total_reached`, `login_required`)

### Regras de negócio (resumo)
- Código é **case-insensitive** (armazenado em UPPER).
- Tipos: `percent` (0-100) e `fixed` (R$).
- `expires_at`: se definido, cupom expira quando `now > expires_at`.
- `usage_limit_total`: 0 = ilimitado; senão, limita pelo total de resgates.
- `usage_limit_per_user`: 0 = ilimitado; senão, exige usuário autenticado e limita por cliente.
- Desconto **nunca** pode exceder o subtotal.
- O pedido recalcula e revalida cupom no backend durante a criação do pedido (não confie no frontend).


## Chat de suporte (cliente ⇄ admin)

### Migração (MySQL)
Rode as migrações:
```bash
cd backend
alembic upgrade head
```

### Endpoints (API)
Base: `http://localhost:8000/api/v1`

Requer **JWT** no header: `Authorization: Bearer <token>`.

**Cliente**
 - **POST** `/support/{store_slug}/conversations` → cria (ou retorna) a conversa aberta do usuário.
 - **GET** `/support/{store_slug}/conversations` → lista conversas do usuário.
 - **GET** `/support/{store_slug}/conversations/{id}/messages` → histórico.
 - **POST** `/support/{store_slug}/conversations/{id}/messages` → envia mensagem.
 - **POST** `/support/{store_slug}/conversations/{id}/close` → encerra.

**Admin (superuser)**
 - **GET** `/support/{store_slug}/conversations?status=open` → “inbox” do suporte.
 - **POST** `/support/{store_slug}/conversations/{id}/messages` → responde.
 - **POST** `/support/{store_slug}/conversations/{id}/close` → encerra.

### Observação (WebSocket)
O chat é **assíncrono** (polling). A estrutura já inclui `last_message_at` e um prefixo `/support` único para evoluir com WebSocket futuramente.
