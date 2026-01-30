/* Base: header (busca + autocomplete), carrinho (localStorage) e renderizações comuns */

// Configuração central (ver assets/js/config.js)
const LV = (window.LV_CONFIG || { STORE_SLUG: 'roupas', API_BASE_URL: 'http://localhost:8000/api/v1', USE_MOCK_DATA: false });

const CART_KEY = 'lv_cart_v1';

function readCart(){
  try{ return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch(e){ return []; }
}

function writeCart(items){
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function cartCount(){
  return readCart().reduce((sum, it) => sum + (it.qty || 0), 0);
}

function updateCartBadge(){
  const badge = document.querySelector('[data-cart-badge]');
  if(!badge) return;
  const c = cartCount();
  badge.textContent = String(c);
  badge.style.display = c > 0 ? 'inline-flex' : 'none';
}

function addToCart({productSlug, variantSku, qty}){
  const product = getProductBySlug(productSlug);
  if(!product) return { ok:false, message:'Produto não encontrado.' };

  const cart = readCart();
  const existing = cart.find(it => it.productSlug === productSlug && it.variantSku === variantSku);

  if(existing){
    existing.qty = clamp((existing.qty||0) + qty, 1, 99);
  }else{
    cart.push({
      productSlug,
      variantSku,
      qty: clamp(qty, 1, 99),
      addedAt: Date.now()
    });
  }

  writeCart(cart);
  return { ok:true, message:'Adicionado ao carrinho.' };
}

function removeFromCart(productSlug, variantSku){
  const cart = readCart().filter(it => !(it.productSlug === productSlug && it.variantSku === variantSku));
  writeCart(cart);
}

function updateCartQty(productSlug, variantSku, qty){
  const cart = readCart();
  const item = cart.find(it => it.productSlug === productSlug && it.variantSku === variantSku);
  if(!item) return;
  item.qty = clamp(Number(qty) || 1, 1, 99);
  writeCart(cart);
}

function cartLineItems(){
  const cart = readCart();
  return cart.map(it => {
    const product = getProductBySlug(it.productSlug);
    if(!product) return null;
    const variant = product.variants.find(v => v.sku === it.variantSku) || null;
    const price = variant ? variant.price : getPrimaryPrice(product);
    return {
      ...it,
      product,
      productId: product.id,
      variant,
      variantId: variant ? variant.id : null,
      price,
      lineTotal: price * (it.qty||0)
    };
  }).filter(Boolean);
}

function cartTotals(){
  const items = cartLineItems();
  const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
  return { items, subtotal };
}

function setText(sel, txt){
  const el = document.querySelector(sel);
  if(el) el.textContent = txt;
}

function renderProductCard(product, {showQuickAdd=true}={}){
  const price = getPrimaryPrice(product);
  const was = (product.sale_price && product.sale_price < product.base_price) ? product.base_price : null;

  const article = document.createElement('article');
  article.className = 'card';
  article.innerHTML = `
    <a class="card-media" href="${getProductUrl(product)}" aria-label="Ver ${product.name}">
      <img src="${product.image_url}" alt="${product.name} em foto ilustrativa" loading="lazy" width="900" height="1200">
    </a>
    <div class="card-body">
      <h3 class="card-title"><a href="${getProductUrl(product)}">${product.name}</a></h3>
      <div class="card-meta">${product.short_description}</div>
      <div class="price">
        <div class="now">${formatBRL(price)}</div>
        ${was ? `<div class="was">${formatBRL(was)}</div>` : ''}
      </div>
      <div class="card-actions">
        <a class="btn btn-sm" href="${getProductUrl(product)}">Detalhes</a>
        ${showQuickAdd ? `<button class="btn btn-primary btn-sm" data-quick-add="${product.slug}">Adicionar</button>` : ''}
      </div>
    </div>
  `;
  return article;
}

function bindQuickAdd(root=document){
  root.querySelectorAll('[data-quick-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.getAttribute('data-quick-add');
      const product = getProductBySlug(slug);
      if(!product) return;
      // escolha padrão: primeira variante ativa
      const v = product.variants.find(x => x.active) || null;
      const res = addToCart({ productSlug: slug, variantSku: v ? v.sku : '', qty: 1 });
      toast(res.message);
    });
  });
}

/* Toast simples */
function toast(message){
  const el = document.createElement('div');
  el.setAttribute('role','status');
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.bottom = '18px';
  el.style.transform = 'translateX(-50%)';
  el.style.background = '#111';
  el.style.color = '#fff';
  el.style.padding = '10px 12px';
  el.style.borderRadius = '12px';
  el.style.boxShadow = '0 10px 30px rgba(0,0,0,.18)';
  el.style.zIndex = '100';
  el.style.fontSize = '14px';
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => { el.remove(); }, 2200);
}

/* Busca com autocomplete */
function initSearch(){
  const input = document.querySelector('[data-search-input]');
  const box = document.querySelector('[data-autocomplete]');
  if(!input || !box) return;

  const resultsContainer = box;

  function close(){
    resultsContainer.setAttribute('aria-hidden','true');
    resultsContainer.innerHTML = '';
  }

  function open(){ resultsContainer.setAttribute('aria-hidden','false'); }

  function render(list){
    resultsContainer.innerHTML = '';
    if(list.length === 0){ close(); return; }

    list.slice(0,6).forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<strong>${p.name}</strong><div class="kbd-hint">${formatBRL(getPrimaryPrice(p))} • ${p.category}</div>`;
      b.addEventListener('click', () => { window.location.href = getProductUrl(p); });
      resultsContainer.appendChild(b);
    });
    open();
  }

  input.addEventListener('input', () => {
    const q = (input.value || '').trim().toLowerCase();
    if(q.length < 2){ close(); return; }
    const list = getActiveProducts().filter(p => p.name.toLowerCase().includes(q));
    render(list);
  });

  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      const q = (input.value || '').trim();
      if(q.length === 0) return;
      window.location.href = `category.html?q=${encodeURIComponent(q)}`;
    }
    if(e.key === 'Escape') close();
  });

  document.addEventListener('click', (e) => {
    if(!resultsContainer.contains(e.target) && e.target !== input) close();
  });
}

function setCanonical(url){
  const link = document.querySelector('link[rel="canonical"]');
  if(link) link.setAttribute('href', url);
}

async function initCommon(){
  updateCartBadge();

  // Catálogo deve ser carregado antes da busca/autocomplete.
  if(typeof ensureCatalogLoaded === 'function'){
    try{ await ensureCatalogLoaded(); } catch(_){ /* fallback silencioso */ }
  }

  initSearch();

  // ícone carrinho
  const cartBtn = document.querySelector('[data-cart-link]');
  if(cartBtn){
    cartBtn.addEventListener('click', () => { window.location.href = 'cart.html'; });
  }
}

document.addEventListener('DOMContentLoaded', initCommon);
