# Web Site (HTML/CSS/JS)  Loja Aurora Clothing

Este diretrio contm um **site completo e navegvel localmente** (sem frameworks) para loja virtual de roupas.

## Como abrir localmente

### Opo 1: abrir o `index.html`
- Clique duas vezes em `web_site/index.html`.
- Voc pode navegar entre as pginas por links.

### Opo 2 (recomendado): rodar servidor local (melhor para cache e localStorage)
No terminal, dentro da pasta `web_site`:

```bash
python -m http.server 5500
```

Depois acesse no navegador:

- `http://localhost:5500/index.html`

## Pginas

- `index.html` (Home: Novidades, Mais vendidos, Promoes)
- `category.html` (Categoria: filtros, ordenao, breadcrumbs, paginao)
- `product.html` (Produto: galeria, variaes, tabela de medidas (modal), frete por CEP, relacionados)
- `cart.html` (Carrinho: quantidade, remover, cupom UI, resumo)
- `checkout.html` (Checkout UI: cliente, endereo, frete/pagamento UI, validaes)
- `contact.html` (Contato: validao)
- `support.html` (Chat de suporte: requer JWT; polling)
- `support-admin.html` (Inbox do suporte: requer JWT de superuser; polling)

## Estrutura

```
web_site/
  assets/
    css/styles.css
    js/
      products.js  (catlogo local)
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

## Catlogo local (mock)

O catlogo  definido em `assets/js/products.js`:

- `PRODUCTS[]` com estrutura compatvel com o **backend FastAPI** do seu projeto:
  - `id, category_id, name, description, image_url, base_price, is_active, variants[]`
  - `variants[]`: `sku, color, size, price, stock, active`

Isso facilita trocar o mock por dados reais do banco (MySQL) usando os endpoints pblicos do backend.

## Como usar o **mesmo banco de dados** do backend (prximo passo)

## Configurao da API

Este site est em modo **mock/local** (dados em `assets/js/products.js`) e **no faz fetch** da API por padro.

Quando voc for integrar, use como base:

- **Dev (padro):** `http://localhost:8000/api/v1`
- **Produo:** substitua pelo domnio/URL real onde sua API estiver publicada, mantendo o prefixo `/api/v1`.

No JavaScript, a base est preparada em `assets/js/main.js`:

- `API_BASE_URL` (default: `http://localhost:8000/api/v1`)
- override opcional em runtime:
  - `window.__API_BASE_URL__ = 'https://sua-api.com/api/v1'`

Seu backend j expe catlogo pblico em (preferencialmente **versionado** e com store no path):

- `GET /api/v1/public/{store_slug}/categories`
- `GET /api/v1/public/{store_slug}/products?category_id=...&q=...&limit=...&offset=...`
- `GET /api/v1/public/{store_slug}/products/{product_id}`

Obs.: por compatibilidade temporria, existem endpoints legados (query-based) que ainda aceitam `?store_slug=...`, mas devem ser tratados como **deprecated**.

Para integrar:

1. Substitua as leituras do array local em `products.js` por `fetch()` para a API.
2. Mantenha o mesmo shape (campos) do schema `ProductOut` do backend.
3. Ajuste a gerao de URL/slug no backend (ou retorne slug no payload) para ter URLs amigveis sem querystring.

Sugesto: criar no backend um campo `slug` em `products` (ou gerar do `name`) e expor no `ProductOut`.

## SEO (o que j est implementado)

- **Cada pgina** tem: `title` e `meta description` nicos, `canonical`, `robots`, Open Graph e Twitter Card.
- **Dados estruturados JSON-LD**:
  - Home: `Organization` + `WebSite` com `SearchAction`
  - Categoria: `BreadcrumbList` + `CollectionPage` (gerado por JS)
  - Produto: `Product` com `offers` e `aggregateRating` placeholder (gerado por JS)
- HTML semntico: `header`, `nav`, `main`, `section`, `article`, `footer`.
- 1 `H1` por pgina e hierarquia de headings.
- Imagens com `alt` e `loading="lazy"`.
- `robots.txt` + `sitemap.xml`.

## Performance

- CSS enxuto, sem bibliotecas.
- JS leve, sem frameworks.
- Fonte via Google Fonts com `preconnect` e `display=swap`.

## Observaes

- As imagens so placeholders locais em SVG (proporo 3:4) para manter o site totalmente offline.
- Textos de entrega/pagamento/troca so placeholders (microcopy) e devem ser conectados ao backend quando voc ativar pagamentos e logstica.

