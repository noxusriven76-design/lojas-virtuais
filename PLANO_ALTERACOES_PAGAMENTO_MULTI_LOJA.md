# Plano de Alteracoes - Pagamento no Admin por Loja (sem checkout hospedado)

## Objetivo
Implementar configuracao e processamento de pagamento por loja (`store_id`/`store_slug`) no fluxo de checkout proprio, com integracao real de gateway (ex.: Pix), mantendo isolamento multi-tenant.

## Arquivos, classes e funcoes que vou alterar

### Backend - modelagem e contratos
- `backend/app/models/payment.py`
  - Classe `StorePaymentMethod`: estender `metadata_json` para conter configuracao por metodo/provedor (chaves nao sensiveis e referencias de segredo).
  - Nova classe `StorePaymentProviderConfig` (nova tabela): credenciais por loja/provedor/metodo, com campos criptografados para segredos.
- `backend/app/schemas/payment_method.py`
  - `StorePaymentMethodCreateIn`, `StorePaymentMethodUpdateIn`, `StorePaymentMethodOut`: incluir campos de configuracao controlados para admin.
- `backend/app/schemas/order.py`
  - `OrderCreateIn`: incluir campos de pagamento do checkout (ex.: `payment_method`, `payment_data` minimo).
  - `OrderOut`: incluir retorno de instrucoes/status de pagamento quando aplicavel.
- `backend/alembic/versions/<nova_migration>.py`
  - Criar migration para nova tabela de configuracao e indices de consulta por `store_id` + `provider`.

### Backend - API/admin/public/webhook
- `backend/app/api/routes/admin_payment_methods.py`
  - Funcoes: `create_store_payment_method`, `update_store_payment_method`, `list_store_payment_methods`.
  - Ajustar validacao e persistencia da configuracao por loja.
- `backend/app/api/routes/orders.py`
  - Funcao: `create_new_order`.
  - Passar a disparar criacao de transacao no provedor com base no metodo escolhido.
- `backend/app/api/routes/payments_webhook.py`
  - Funcao: `receive_payment_webhook`.
  - Resolver segredo por loja/provedor, validar assinatura e atualizar `PaymentTransaction`/pedido com idempotencia.
- `backend/app/api/routes/public_catalog.py`
  - Funcao: `get_active_store_payment_methods`.
  - Expor apenas dados publicos necessarios ao checkout (sem segredos).
- `backend/app/core/config.py`
  - Manter fallback global de `PAYMENT_WEBHOOK_SECRETS`, mas priorizar segredo por loja vindo do banco.
- `backend/app/api/router.py`
  - Incluir novo router admin de configuracao de gateway (se criado em arquivo dedicado).

### Backend - servico de integracao de pagamento (novo)
- `backend/app/services/payments/provider_base.py` (novo)
  - Interface/base para `create_payment`, `query_payment`, `refund`.
- `backend/app/services/payments/pix_<provedor>.py` (novo)
  - Implementacao concreta de Pix.
- `backend/app/services/payments/factory.py` (novo)
  - Selecao de provedor por configuracao da loja/metodo.

### Frontend Admin
- `admin_panel/src/payments/paymentMethods.api.ts`
  - Tipagens e payloads para suportar configuracao de gateway por loja.
- `admin_panel/src/pages/PaymentMethodsPage.tsx`
  - Formulario para configurar metodo + credenciais/regras por loja.
  - Persistir/editar sem expor segredo em leitura.
- `admin_panel/src/authz/permissions.ts`
  - (Se necessario) permissao fina para configurar credenciais de pagamento.

### Frontend Checkout (3 lojas estaticas)
- `backend/app/static/site_assets/roupas/assets/js/core/checkoutApi.js`
- `backend/app/static/site_assets/relogios/assets/js/core/checkoutApi.js`
- `backend/app/static/site_assets/agro/assets/js/core/checkoutApi.js`
  - Funcao `createOrder`: enviar `paymentMethod` e dados minimos de pagamento para API real.
  - Remover dependencia de instrucoes mock como caminho principal.

### Testes
- `backend/tests/test_payment_methods_phase7.py` (ajustes)
- `backend/tests/test_payments_webhook_phase2.py` (ajustes)
- Novos testes:
  - `backend/tests/test_payment_provider_config_admin.py`
  - `backend/tests/test_checkout_payment_creation.py`
  - `backend/tests/test_webhook_signature_per_store.py`

## Por que esses pontos sao os corretos (com referencia ao codigo atual)
- O projeto ja e multi-loja por `store_id`:
  - `StorePaymentMethod` e unico por loja+codigo em `backend/app/models/payment.py` (`UniqueConstraint("store_id", "code", ...)`).
- O admin ja gerencia formas de pagamento por loja:
  - `backend/app/api/routes/admin_payment_methods.py` e `admin_panel/src/pages/PaymentMethodsPage.tsx`.
- O checkout ja consulta metodos por loja:
  - `GET /api/v1/stores/{store_slug}/payment-methods` em `backend/app/api/routes/public_catalog.py` (`get_active_store_payment_methods`).
- O gargalo atual esta no fechamento do pedido:
  - `createOrder` no frontend passa por fallback/mock e `orders.py::create_new_order` nao processa pagamento real.
  - `OrderCreateIn` em `backend/app/schemas/order.py` nao carrega payload de pagamento real.
- Webhook existe, mas segredo e resolvido de forma global por ambiente:
  - `parse_payment_webhook_secrets(settings.payment_webhook_secrets)` em `backend/app/api/routes/payments_webhook.py`.
  - Para multi-loja com gateways distintos, precisamos resolucao por loja/provedor.

## Efeitos colaterais possiveis
- Mudanca de contrato API (`POST /orders`) pode quebrar clientes antigos se nao houver retrocompatibilidade.
- Erro de configuracao por loja pode causar pedidos criados sem transacao valida.
- Webhook com assinatura/perfil incorreto pode gerar `401` e atrasar confirmacao.
- Risco de vazamento de segredo se log/snapshot de auditoria incluir campos sensiveis.
- Maior latencia no checkout por chamada ao gateway externo.
- Necessidade de migracao de dados para lojas ja em producao.

## Plano de teste

### 1. Testes unitarios
- Validacao de payload de configuracao por loja/metodo.
- Selecao de provedor correta por `store_id`/`payment_method`.
- Sanitizacao de campos sensiveis em logs/auditoria.

### 2. Testes de integracao backend
- Admin:
  - criar/editar/listar configuracao de pagamento por loja.
  - garantir isolamento (loja A nao le/escreve loja B).
- Checkout:
  - `POST /orders` com `payment_method=pix` cria `PaymentTransaction` pendente.
  - resposta inclui instrucoes/identificador de pagamento.
- Webhook:
  - assinatura valida processa e atualiza pedido/transacao.
  - assinatura invalida retorna `401`.
  - evento duplicado e ignorado (idempotencia).

### 3. Testes E2E (fluxo real)
- Loja A e Loja B com credenciais diferentes do mesmo provedor.
- Checkout em cada loja cria cobranca separada e nao mistura `store_id`.
- Confirmacao por webhook altera apenas pedido da loja correta.

### 4. Regressao
- Listagem admin de pagamentos (`admin_payments.py`) continua funcional.
- `GET /stores/{store_slug}/payment-methods` continua retornando apenas ativos.
- Fluxos de pedido sem pagamento (se permitido) mantem comportamento definido.

### 5. Criterios de aceite
- Configuracao de pagamento e totalmente por loja no admin.
- Checkout proprio processa pagamento real sem redirecionamento hospedado.
- Auditoria registra alteracoes sem expor segredos.
- Sem vazamento cross-store em metodos, transacoes e webhooks.
