import { safeUrl, setText } from './utils/sanitize.js';
import { createProductSkeleton, renderSkeletonGrid, renderErrorState, renderEmptyState, createErrorState } from './ui/states.js';
import {
  STORE,
  ensureCatalogLoaded,
  getActiveProducts,
  getCategoryById,
  getCategoryUrl,
  getProductBySlug,
  getPrimaryPrice,
  getVariantOptions,
  findVariant,
  formatBRL,
} from './products.js';
import {
  addToCart,
  toast,
  setCanonical,
  updateCartBadge,
  renderProductCard,
  bindQuickAdd,
} from './main.js';

let _catalogReady = false;
let _productTemplateHtml = null;
let _renderSeq = 0;

function _paintNextFrame(){
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

function _productRoot(){
  return document.querySelector('.product');
}

function _relatedGrid(){
  return document.querySelector('[data-related]');
}

function _showProductLoading(){
  const root = _productRoot();
  if(!root) return;
  if(_productTemplateHtml == null) _productTemplateHtml = root.innerHTML;
  root.setAttribute('aria-busy','true');
  root.innerHTML = '';
  root.appendChild(createProductSkeleton());
  const rel = _relatedGrid();
  if(rel) renderSkeletonGrid(rel, { count: 4 });
}

function _restoreProductTemplate(){
  const root = _productRoot();
  if(!root || _productTemplateHtml == null) return;
  root.innerHTML = _productTemplateHtml;
  root.removeAttribute('aria-busy');
}

function _showProductError(err){
  const root = _productRoot();
  if(!root) return;
  root.removeAttribute('aria-busy');
  const msg = err?.message ? `Tente novamente. (${err.message})` : 'Tente novamente.';
  renderErrorState(root, {
    title: 'No foi possvel carregar este produto',
    message: msg,
    onRetry: () => { _catalogReady = false; renderProductPage(); }
  });
  const rel = _relatedGrid();
  if(rel) rel.innerHTML = '';
}

function _showProductEmpty(slug){
  const root = _productRoot();
  if(!root) return;
  root.removeAttribute('aria-busy');
  const suffix = slug ? `${slug}` : 'este item';
  renderEmptyState(root, {
    title: 'Produto no encontrado',
    message: `No encontramos um produto para ${suffix}.`,
    primaryAction: { label: 'Ver catlogo', href: 'category.html' },
    secondaryAction: { label: 'Voltar para home', href: 'index.html' }
  });
  const rel = _relatedGrid();
  if(rel) rel.innerHTML = '';
  const titleEl = document.querySelector('title');
  if(titleEl) titleEl.textContent = 'Produto no encontrado | Aurora Clothing';
}

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
    const img = document.createElement('img');
    img.src = safeUrl(src, {allowDataImages:true}) || '';
    img.alt = `${String(product.name || '')} - imagem principal`;
    img.loading = 'eager';
    img.width = 900;
    img.height = 1200;
    main.innerHTML = '';
    main.appendChild(img);
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
    const img = document.createElement('img');
    img.src = safeUrl(src, {allowDataImages:true}) || '';
    img.alt = `Miniatura ${idx+1} de ${String(product.name || '')}`;
    img.loading = 'lazy';
    img.width = 300;
    img.height = 400;
    b.appendChild(img);
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
      stockEl.textContent = stock > 0 ? `Em estoque (${stock})` : 'Indisponvel';
    }

    // aria-pressed
    colorsWrap?.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-color')===selectedColor ? 'true':'false'));
    sizesWrap?.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-size')===selectedSize ? 'true':'false'));

    // botes
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

  // Aes de compra
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
    if(cep.length !== 8){ out.textContent = 'Informe um CEP vlido (8 dgitos).'; return; }

    const v = typeof getSelectedVariant === 'function' ? getSelectedVariant() : null;
    if(!v || !v.id){ out.textContent = 'Selecione uma variao vlida.'; return; }

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
      if(opts.length === 0){ out.textContent = 'Sem opes de frete para este CEP.'; return; }

      // mostra a primeira opo (mais barata j vem ordenada no backend)
      const o = opts[0];
      out.textContent = `Frete: ${formatBRL(Number(o.price||0))}  Entrega estimada: ${Number(o.eta_days||0)} dias teis.`;
    } catch(e){
      out.textContent = `No foi possvel calcular o frete. ${e?.message ? '('+e.message+')' : ''}`;
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
  const seq = ++_renderSeq;
  _showProductLoading();
  if(!_catalogReady) await _paintNextFrame();

  let catalogError = null;
  try{
    await ensureCatalogLoaded();
    _catalogReady = true;
  } catch(e){
    // Mantm fallback local (STORE) quando disponvel.
    catalogError = e;
  }

  const slug = getProductSlugFromUrl();
  const all = getActiveProducts();
  if(!_catalogReady && all && all.length > 0) _catalogReady = true;
  const product = slug ? getProductBySlug(slug) : (all[0] || null);

  // Empty / error state
  if(slug && !product){
    _restoreProductTemplate();
    _showProductEmpty(slug);
    return;
  }
  if(!slug && !product){
    _restoreProductTemplate();
    if(catalogError) _showProductError(catalogError);
    else _showProductEmpty('');
    return;
  }

  _restoreProductTemplate();

  if(catalogError){
    const root = _productRoot();
    if(root){
      root.prepend(createErrorState({
        title: 'Dados ao vivo indisponveis',
        message: 'Exibindo catlogo offline. Voc pode tentar novamente para buscar dados atualizados.',
        onRetry: () => { _catalogReady = false; renderProductPage(); },
        retryLabel: 'Tentar novamente',
        secondaryAction: null
      }));
    }
  }

  try{

  // Content
  setText('[data-name]', product.name);
  setText('[data-desc]', product.description);
  setText('[data-cat]', getCategoryById(product.category_id)?.name || product.category);

  // Head meta
  const titleEl = document.querySelector('title');
  if(titleEl) titleEl.textContent = `${product.name} | Aurora Clothing`;

  const short = product.short_description || product.description || product.name || 'Produto';
  setMeta('description', `${short} Confira detalhes, variaes de tamanho/cor, e compra rpida com troca fcil.`);

  setOg('og:title', `${product.name} | Aurora Clothing`);
  setOg('og:description', short);
  setOg('og:image', `${STORE.url}/${product.image_url}`);

  // Canonical deve refletir a pgina real existente (HTML esttico)
  setCanonical(`${STORE.url}/product.html`);

  // breadcrumbs
  const bc = document.querySelector('[data-breadcrumbs]');
  if(bc){
    const catSlug = getCategoryById(product.category_id)?.slug || 'catalogo';
    bc.innerHTML = '';
    const aHome = document.createElement('a');
    aHome.href = 'index.html';
    aHome.textContent = 'Incio';
    bc.appendChild(aHome);

    const sep1 = document.createElement('span');
    sep1.setAttribute('aria-hidden','true');
    sep1.textContent = ' / ';
    bc.appendChild(sep1);

    const aCat = document.createElement('a');
    aCat.href = safeUrl(getCategoryUrl(catSlug)) || 'category.html';
    setText(aCat, getCategoryById(product.category_id)?.name || product.category);
    bc.appendChild(aCat);

    const sep2 = document.createElement('span');
    sep2.setAttribute('aria-hidden','true');
    sep2.textContent = ' / ';
    bc.appendChild(sep2);

    const cur = document.createElement('span');
    cur.setAttribute('aria-current','page');
    setText(cur, product.name);
    bc.appendChild(cur);
  }

  // gallery + variants
  renderGallery(product);
  const updateVariant = renderVariantSelectors(product);
  updateVariant();
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
  } catch(e){
    if(seq !== _renderSeq) return;
    _showProductError(e);
  }
}

document.addEventListener('DOMContentLoaded', () => { renderProductPage(); });

