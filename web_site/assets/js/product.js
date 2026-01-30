function getProductSlugFromUrl(){
  const u = new URL(window.location.href);
  return u.searchParams.get('slug') || '';
}

function setMeta(name, content){
  const el = document.querySelector(`meta[name="${name}"]`);
  if(el) el.setAttribute('content', content);
}

function setOg(property, content){
  const el = document.querySelector(`meta[property="${property}"]`);
  if(el) el.setAttribute('content', content);
}

function renderGallery(product){
  const main = document.querySelector('[data-gallery-main]');
  const thumbs = document.querySelector('[data-thumbs]');
  if(!main || !thumbs) return;

  const imgs = product.images && product.images.length ? product.images : [product.image_url];

  function select(src, idx){
    main.innerHTML = `<img src="${src}" alt="${product.name} - imagem principal" loading="eager" width="900" height="1200">`;
    thumbs.querySelectorAll('[data-thumb]').forEach(t => t.setAttribute('aria-current','false'));
    const cur = thumbs.querySelector(`[data-thumb-index="${idx}"]`);
    if(cur) cur.setAttribute('aria-current','true');
  }

  thumbs.innerHTML = '';
  imgs.slice(0,4).forEach((src, idx) => {
    const b = document.createElement('button');
    b.type='button';
    b.className='thumb';
    b.setAttribute('data-thumb','');
    b.setAttribute('data-thumb-index', String(idx));
    b.setAttribute('aria-current', idx===0 ? 'true':'false');
    b.innerHTML = `<img src="${src}" alt="Miniatura ${idx+1} de ${product.name}" loading="lazy" width="300" height="400">`;
    b.addEventListener('click', () => select(src, idx));
    thumbs.appendChild(b);
  });

  select(imgs[0], 0);
}

function renderVariantSelectors(product){
  const colorsWrap = document.querySelector('[data-colors]');
  const sizesWrap = document.querySelector('[data-sizes]');
  const stockEl = document.querySelector('[data-stock]');
  const skuEl = document.querySelector('[data-sku]');
  const priceNowEl = document.querySelector('[data-price-now]');
  const priceWasEl = document.querySelector('[data-price-was]');

  const opts = getVariantOptions(product);
  let selectedColor = opts.colors[0] || '';
  let selectedSize = opts.sizes[0] || '';

  function update(){
    const v = findVariant(product, selectedColor, selectedSize) || product.variants.find(x => x.active) || null;
    const price = v ? v.price : getPrimaryPrice(product);
    const was = (product.sale_price && product.sale_price < product.base_price) ? product.base_price : null;

    if(priceNowEl) priceNowEl.textContent = formatBRL(price);
    if(priceWasEl) priceWasEl.textContent = was ? formatBRL(was) : '';
    if(priceWasEl) priceWasEl.style.display = was ? 'inline' : 'none';

    if(skuEl) skuEl.textContent = v?.sku || '-';
    if(stockEl){
      const stock = v?.stock ?? 0;
      stockEl.textContent = stock > 0 ? `Em estoque (${stock})` : 'Indisponível';
    }

    // aria-pressed
    colorsWrap?.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-color')===selectedColor ? 'true':'false'));
    sizesWrap?.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-size')===selectedSize ? 'true':'false'));

    // botões
    const addBtn = document.querySelector('[data-add-to-cart]');
    const buyBtn = document.querySelector('[data-buy-now]');
    const canBuy = (v && v.stock > 0);
    [addBtn, buyBtn].forEach(btn => {
      if(!btn) return;
      btn.disabled = !canBuy;
      btn.setAttribute('aria-disabled', (!canBuy).toString());
    });

    return v;
  }

  function makeBtn(text, attr, onClick){
    const b = document.createElement('button');
    b.type='button';
    b.className='option';
    b.textContent = text;
    b.setAttribute(attr, text);
    b.setAttribute('aria-pressed','false');
    b.addEventListener('click', () => { onClick(text); update(); });
    return b;
  }

  if(colorsWrap){
    colorsWrap.innerHTML = '';
    opts.colors.forEach(c => colorsWrap.appendChild(makeBtn(c, 'data-color', (val)=>{ selectedColor=val; })));
  }

  if(sizesWrap){
    sizesWrap.innerHTML = '';
    opts.sizes.forEach(s => sizesWrap.appendChild(makeBtn(s, 'data-size', (val)=>{ selectedSize=val; })));
  }

  // medida modal
  const modal = document.querySelector('[data-modal]');
  const openBtn = document.querySelector('[data-open-measures]');
  const closeBtn = document.querySelector('[data-close-modal]');
  function open(){ modal?.setAttribute('aria-hidden','false'); closeBtn?.focus(); }
  function close(){ modal?.setAttribute('aria-hidden','true'); openBtn?.focus(); }
  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => { if(e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if(e.key==='Escape' && modal?.getAttribute('aria-hidden')==='false') close(); });

  // Ações de compra
  const addBtn = document.querySelector('[data-add-to-cart]');
  const buyBtn = document.querySelector('[data-buy-now]');

  addBtn?.addEventListener('click', () => {
    const v = update();
    const res = addToCart({ productSlug: product.slug, variantSku: v?.sku || '', qty: 1 });
    toast(res.message);
    updateCartBadge();
  });

  buyBtn?.addEventListener('click', () => {
    const v = update();
    const res = addToCart({ productSlug: product.slug, variantSku: v?.sku || '', qty: 1 });
    if(res.ok) window.location.href = 'checkout.html';
  });

  return update;
}

async function _fetchJson(url, {method='GET', body=null}={}){
  const headers = { 'Accept':'application/json' };
  if(body) headers['Content-Type'] = 'application/json; charset=utf-8';
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  const text = await res.text();
  let json;
  try{ json = text ? JSON.parse(text) : null; } catch(_){ json = text; }
  if(!res.ok){
    const msg = (json && json.error && json.error.message) ? json.error.message : (json && json.detail) ? json.detail : ('HTTP ' + res.status);
    const requestId = (json && json.error && json.error.request_id) ? json.error.request_id : res.headers.get('x-request-id');
    throw new Error(requestId ? `${msg} (ref: ${requestId})` : msg);
  }
  return json;
}

function _cleanCep(cep){ return String(cep || '').replace(/\D/g,''); }

function bindShippingSimulator(product, getSelectedVariant){
  const input = document.querySelector('[data-cep]');
  const btn = document.querySelector('[data-calc-shipping]');
  const out = document.querySelector('[data-shipping-result]');
  if(!input || !btn || !out) return;

  async function render(){
    const cfg = (window.LV_CONFIG || { STORE_SLUG: STORE.slug, API_BASE_URL: 'http://localhost:8000/api/v1' });
    const cep = _cleanCep(input.value);
    if(cep.length !== 8){ out.textContent = 'Informe um CEP válido (8 dígitos).'; return; }

    const v = typeof getSelectedVariant === 'function' ? getSelectedVariant() : null;
    if(!v || !v.id){ out.textContent = 'Selecione uma variação válida.'; return; }

    out.textContent = 'Calculando frete...';
    try{
      const data = await _fetchJson(
        `${String(cfg.API_BASE_URL).replace(/\/+$/,'')}/public/${encodeURIComponent(cfg.STORE_SLUG)}/shipping/quote`,
        {
          method: 'POST',
          body: { cep, items: [{ product_id: product.id, variant_id: v.id, quantity: 1 }] }
        }
      );
      const opts = Array.isArray(data?.options) ? data.options : [];
      if(opts.length === 0){ out.textContent = 'Sem opções de frete para este CEP.'; return; }

      // mostra a primeira opção (mais barata já vem ordenada no backend)
      const o = opts[0];
      out.textContent = `Frete: ${formatBRL(Number(o.price||0))} • Entrega estimada: ${Number(o.eta_days||0)} dias úteis.`;
    } catch(e){
      out.textContent = `Não foi possível calcular o frete. ${e?.message ? '('+e.message+')' : ''}`;
    }
  }

  btn.addEventListener('click', render);
  input.addEventListener('keydown', (e) => { if(e.key==='Enter'){ e.preventDefault(); render(); } });
}

function renderRelated(product){
  const grid = document.querySelector('[data-related]');
  if(!grid) return;
  const list = getActiveProducts().filter(p => p.category_id === product.category_id && p.slug !== product.slug);
  grid.innerHTML = '';
  list.slice(0,4).forEach(p => grid.appendChild(renderProductCard(p)));
  bindQuickAdd(grid);
}

async function renderProductPage(){
  if(typeof ensureCatalogLoaded === 'function'){
    try{ await ensureCatalogLoaded(); } catch(_){ /* fallback */ }
  }
  const slug = getProductSlugFromUrl();
  const product = getProductBySlug(slug) || getActiveProducts()[0];

  // Content
  setText('[data-name]', product.name);
  setText('[data-desc]', product.description);
  setText('[data-cat]', getCategoryById(product.category_id)?.name || product.category);

  // Head meta
  const titleEl = document.querySelector('title');
  if(titleEl) titleEl.textContent = `${product.name} | Aurora Clothing`;

  setMeta('description', `${product.short_description} Confira detalhes, variações de tamanho/cor, e compra rápida com troca fácil.`);

  setOg('og:title', `${product.name} | Aurora Clothing`);
  setOg('og:description', product.short_description);
  setOg('og:image', `${STORE.url}/${product.image_url}`);

  // Canonical deve refletir a página real existente (HTML estático)
  setCanonical(`${STORE.url}/product.html`);

  // breadcrumbs
  const bc = document.querySelector('[data-breadcrumbs]');
  if(bc){
    const catSlug = getCategoryById(product.category_id)?.slug || 'catalogo';
    bc.innerHTML = `
      <a href="index.html">Início</a> <span aria-hidden="true">/</span>
      <a href="${getCategoryUrl(catSlug)}">${getCategoryById(product.category_id)?.name || product.category}</a> <span aria-hidden="true">/</span>
      <span aria-current="page">${product.name}</span>
    `;
  }

  // gallery + variants
  renderGallery(product);
  const updateVariant = renderVariantSelectors(product);
  bindShippingSimulator(product, updateVariant);
  renderRelated(product);

  // JSON-LD Product
  const jsonEl = document.getElementById('jsonld-product');
  if(jsonEl){
    const v0 = product.variants.find(v => v.active) || null;
    const price = v0 ? v0.price : getPrimaryPrice(product);
    const availability = (v0 && v0.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: product.images?.map(src => `${STORE.url}/${src}`) || [`${STORE.url}/${product.image_url}`],
      description: product.description,
      sku: v0?.sku || `AUR-${String(product.id).padStart(3,'0')}`,
      brand: { "@type": "Brand", name: product.brand || 'Aurora' },
      offers: {
        "@type": "Offer",
        price: Number(price).toFixed(2),
        priceCurrency: STORE.currency,
        availability,
        url: `${STORE.url}/product.html`
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.rating_placeholder?.value || 4.7,
        reviewCount: product.rating_placeholder?.count || 128
      }
    };

    jsonEl.textContent = JSON.stringify(data, null, 2);
  }

  // ajuste do SKU/stock ao mudar
  const colorsWrap = document.querySelector('[data-colors]');
  const sizesWrap = document.querySelector('[data-sizes]');
  const onChange = () => { updateVariant(); };
  colorsWrap?.addEventListener('click', onChange);
  sizesWrap?.addEventListener('click', onChange);
}

document.addEventListener('DOMContentLoaded', () => { renderProductPage(); });
