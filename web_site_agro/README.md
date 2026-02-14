# Web Site (HTML/CSS/JS) — Loja Aurora Clothing

Este diretório contém um **site completo e navegável localmente** (sem frameworks) para loja virtual de roupas.

## Como abrir localmente

### Opção 1: abrir o `index.html`
- Clique duas vezes em `web_site/index.html`.
- Você pode navegar entre as páginas por links.

### Opção 2 (recomendado): rodar servidor local (melhor para cache e localStorage)
No terminal, dentro da pasta `web_site`:

```bash
python -m http.server 5500
```

Depois acesse no navegador:

- `http://localhost:5500/index.html`

## Páginas

- `index.html` (Home: Novidades, Mais vendidos, Promoções)
- `category.html` (Categoria: filtros, ordenação, breadcrumbs, paginação)
- `product.html` (Produto: galeria, variações, tabela de medidas (modal), frete por CEP, relacionados)
- `cart.html` (Carrinho: quantidade, remover, cupom UI, resumo)
- `checkout.html` (Checkout UI: cliente, endereço, frete/pagamento UI, validações)
- `contact.html` (Contato: validação)
- `support.html` (Chat de suporte: requer JWT; polling)
- `support-admin.html` (Inbox do suporte: requer JWT de superuser; polling)

## Estrutura

```
web_site/
  assets/
    css/styles.css
    js/
      products.js  (catálogo local)
      main.js      (busca + carrinho)
      home.js
      category.js
      product.js
      cart.js
      checkout.js
      contact.js
      support.js
      support_admin.js
    img/
      brand/logo.svg
      favicon.svg
      og-default.svg
      products/p01.svg ... p20.svg
  robots.txt
  sitemap.xml
```

## Catálogo local (mock)

O catálogo é definido em `assets/js/products.js`:

- `PRODUCTS[]` com estrutura compatível com o **backend FastAPI** do seu projeto:
  - `id, category_id, name, description, image_url, base_price, is_active, variants[]`
  - `variants[]`: `sku, color, size, price, stock, active`

Isso facilita trocar o mock por dados reais do banco (MySQL) usando os endpoints públicos do backend.

## Como usar o **mesmo banco de dados** do backend (próximo passo)

## Configuração da API

Este site está em modo **mock/local** (dados em `assets/js/products.js`) e **não faz fetch** da API por padrão.

Quando você for integrar, use como base:

- **Dev (padrão):** `http://localhost:8000/api/v1`
- **Produção:** substitua pelo domínio/URL real onde sua API estiver publicada, mantendo o prefixo `/api/v1`.

No JavaScript, a base está preparada em `assets/js/main.js`:

- `API_BASE_URL` (default: `http://localhost:8000/api/v1`)
- override opcional em runtime:
  - `window.__API_BASE_URL__ = 'https://sua-api.com/api/v1'`

Seu backend já expõe catálogo público em (preferencialmente **versionado** e com store no path):

- `GET /api/v1/public/{store_slug}/categories`
- `GET /api/v1/public/{store_slug}/products?category_id=...&q=...&limit=...&offset=...`
- `GET /api/v1/public/{store_slug}/products/{product_id}`

Obs.: por compatibilidade temporária, existem endpoints legados (query-based) que ainda aceitam `?store_slug=...`, mas devem ser tratados como **deprecated**.

Para integrar:

1. Substitua as leituras do array local em `products.js` por `fetch()` para a API.
2. Mantenha o mesmo shape (campos) do schema `ProductOut` do backend.
3. Ajuste a geração de URL/slug no backend (ou retorne slug no payload) para ter URLs amigáveis sem querystring.

Sugestão: criar no backend um campo `slug` em `products` (ou gerar do `name`) e expor no `ProductOut`.

## SEO (o que já está implementado)

- **Cada página** tem: `title` e `meta description` únicos, `canonical`, `robots`, Open Graph e Twitter Card.
- **Dados estruturados JSON-LD**:
  - Home: `Organization` + `WebSite` com `SearchAction`
  - Categoria: `BreadcrumbList` + `CollectionPage` (gerado por JS)
  - Produto: `Product` com `offers` e `aggregateRating` placeholder (gerado por JS)
- HTML semântico: `header`, `nav`, `main`, `section`, `article`, `footer`.
- 1 `H1` por página e hierarquia de headings.
- Imagens com `alt` e `loading="lazy"`.
- `robots.txt` + `sitemap.xml`.

## Performance

- CSS enxuto, sem bibliotecas.
- JS leve, sem frameworks.
- Fonte via Google Fonts com `preconnect` e `display=swap`.

## Observações

- As imagens são placeholders locais em SVG (proporção 3:4) para manter o site totalmente offline.
- Textos de entrega/pagamento/troca são placeholders (microcopy) e devem ser conectados ao backend quando você ativar pagamentos e logística.
