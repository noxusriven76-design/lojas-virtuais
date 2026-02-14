/*
  Base: header (busca + autocomplete), carrinho (localStorage via cartStore)
  e renderizações comuns.

  Objetivo desta refatoração:
  - manter a UI e comportamento
  - centralizar estado do carrinho em core/cartStore.js
  - expor exports para ES Modules e, por compatibilidade, também globais.
*/

import { safeUrl, setText } from './utils/sanitize.js';
import { session } from './core/session.js';
import {
  STORE,
  ensureCatalogLoaded,
  getActiveProducts,
  getProductBySlug,
  getPrimaryPrice,
  getProductUrl,
  clamp,
  formatBRL,
} from './products.js';
import {
  getCart,
  cartCount,
  addCartItem,
  removeCartItem,
  updateCartItemQty,
  subscribeCart,
} from './core/cartStore.js';

export function updateCartBadge(){
  const badge = document.querySelector('[data-cart-badge]');
  if(!badge) return;
  const c = cartCount();
  badge.textContent = String(c);
  badge.style.display = c > 0 ? 'inline-flex' : 'none';
}

export function addToCart({ productSlug, variantSku, qty }){
  const product = getProductBySlug(productSlug);
  if(!product) return { ok:false, message:'Produto não encontrado.' };

  addCartItem({ productSlug, variantSku, qty });
  return { ok:true, message:'Adicionado ao carrinho.' };
}

export function removeFromCart(productSlug, variantSku){
  removeCartItem(productSlug, variantSku);
}

export function updateCartQty(productSlug, variantSku, qty){
  updateCartItemQty(productSlug, variantSku, qty);
}

export function cartLineItems(){
  const cart = getCart();
  return cart.map(it => {
    const product = getProductBySlug(it.productSlug);
    if(!product){
      return {
        ...it,
        product: null,
        productId: null,
        variant: null,
        variantId: null,
        price: 0,
        lineTotal: 0,
      };
    }
    const variant = Array.isArray(product.variants)
      ? (product.variants.find(v => v.sku === it.variantSku) || null)
      : null;
    const price = Number(variant ? variant.price : getPrimaryPrice(product)) || 0;
    return {
      ...it,
      product,
      productId: product.id,
      variant,
      variantId: variant ? variant.id : null,
      price,
      lineTotal: price * (it.qty || 0),
    };
  });
}

export function cartTotals(){
  const items = cartLineItems();
  const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
  return { items, subtotal };
}

export function renderProductCard(product, { showQuickAdd=true }={}){
  const price = getPrimaryPrice(product);
  const boletoPrice = price > 0 ? (price * 0.97) : 0;
  const was = (product.sale_price && product.sale_price < product.base_price) ? product.base_price : null;

  const article = document.createElement('article');
  article.className = 'card';

  const mediaLink = document.createElement('a');
  mediaLink.className = 'card-media';
  mediaLink.href = safeUrl(getProductUrl(product)) || 'product.html';
  mediaLink.setAttribute('aria-label', `Ver ${String(product.name || '')}`);

  const img = document.createElement('img');
  img.src = safeUrl(product.image_url, { allowDataImages:true }) || '';
  img.alt = `${String(product.name || '')} em foto ilustrativa`;
  img.loading = 'lazy';
  img.width = 900;
  img.height = 1200;
  mediaLink.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card-body';

  const h3 = document.createElement('h3');
  h3.className = 'card-title';
  const titleLink = document.createElement('a');
  titleLink.className = 'card-title-link';
  titleLink.href = mediaLink.href;
  setText(titleLink, product.name);
  h3.appendChild(titleLink);

  const priceWrap = document.createElement('div');
  priceWrap.className = 'price';
  const now = document.createElement('div');
  now.className = 'now';
  const nowStrong = document.createElement('strong');
  setText(nowStrong, formatBRL(price));
  const nowSuffix = document.createElement('span');
  setText(nowSuffix, 'a vista');
  now.appendChild(nowStrong);
  now.appendChild(document.createTextNode(' '));
  now.appendChild(nowSuffix);
  priceWrap.appendChild(now);

  if(boletoPrice > 0){
    const boleto = document.createElement('div');
    boleto.className = 'boleto';
    const boletoStrong = document.createElement('strong');
    setText(boletoStrong, formatBRL(boletoPrice));
    const boletoSuffix = document.createElement('span');
    setText(boletoSuffix, 'no boleto');
    boleto.appendChild(boletoStrong);
    boleto.appendChild(document.createTextNode(' '));
    boleto.appendChild(boletoSuffix);
    priceWrap.appendChild(boleto);
  }

  if(was){
    const wasEl = document.createElement('div');
    wasEl.className = 'was';
    setText(wasEl, formatBRL(was));
    priceWrap.appendChild(wasEl);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions card-actions-hover';

  if(showQuickAdd){
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'qty-control';

    const dec = document.createElement('button');
    dec.type = 'button';
    dec.className = 'qty-btn';
    dec.setAttribute('data-qty-dec', '1');
    dec.setAttribute('aria-label', `Diminuir quantidade de ${String(product.name || 'produto')}`);
    dec.textContent = '-';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty-input';
    qtyInput.value = '1';
    qtyInput.min = '1';
    qtyInput.max = '99';
    qtyInput.step = '1';
    qtyInput.setAttribute('inputmode', 'numeric');
    qtyInput.setAttribute('aria-label', `Quantidade de ${String(product.name || 'produto')}`);
    qtyInput.setAttribute('data-qty-input', '1');

    const inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'qty-btn';
    inc.setAttribute('data-qty-inc', '1');
    inc.setAttribute('aria-label', `Aumentar quantidade de ${String(product.name || 'produto')}`);
    inc.textContent = '+';

    qtyWrap.appendChild(dec);
    qtyWrap.appendChild(qtyInput);
    qtyWrap.appendChild(inc);
    actions.appendChild(qtyWrap);

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.type = 'button';
    btn.setAttribute('data-quick-add', String(product.slug || ''));
    btn.setAttribute('data-product-name', String(product.name || 'Produto'));
    setText(btn, 'Adicionar');
    actions.appendChild(btn);
  }

  body.appendChild(h3);
  body.appendChild(priceWrap);
  body.appendChild(actions);

  article.appendChild(mediaLink);
  article.appendChild(body);
  return article;
}

export function bindQuickAdd(root=document){
  root.querySelectorAll('.qty-control').forEach(control => {
    const input = control.querySelector('[data-qty-input]');
    const dec = control.querySelector('[data-qty-dec]');
    const inc = control.querySelector('[data-qty-inc]');
    if(!input || !dec || !inc) return;

    const normalize = () => {
      const raw = Number(input.value || 1);
      input.value = String(clamp(Number.isFinite(raw) ? raw : 1, 1, 99));
    };

    dec.addEventListener('click', () => {
      normalize();
      input.value = String(clamp(Number(input.value) - 1, 1, 99));
    });
    inc.addEventListener('click', () => {
      normalize();
      input.value = String(clamp(Number(input.value) + 1, 1, 99));
    });
    input.addEventListener('change', normalize);
    input.addEventListener('blur', normalize);
  });

  root.querySelectorAll('[data-quick-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.getAttribute('data-quick-add');
      const card = btn.closest('.card');
      const qtyInput = card ? card.querySelector('[data-qty-input]') : null;
      const qty = clamp(Number(qtyInput?.value || 1), 1, 99);
      const product = getProductBySlug(slug);
      if(!product) return;
      const v = product.variants.find(x => x.active) || null;
      const res = addToCart({ productSlug: slug, variantSku: v ? v.sku : '', qty });
      const pname = btn.getAttribute('data-product-name') || 'Produto';
      toast(res.ok ? `${pname} adicionado (${qty}).` : res.message);
    });
  });
}

export function toast(message){
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
  el.textContent = String(message || '');
  document.body.appendChild(el);
  window.setTimeout(() => { el.remove(); }, 2200);
}

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

      const strong = document.createElement('strong');
      setText(strong, p.name);

      const hint = document.createElement('div');
      hint.className = 'kbd-hint';
      setText(hint, `${formatBRL(getPrimaryPrice(p))} • ${p.category}`);

      b.appendChild(strong);
      b.appendChild(hint);
      b.addEventListener('click', () => { window.location.href = getProductUrl(p); });
      resultsContainer.appendChild(b);
    });
    open();
  }

  input.addEventListener('input', () => {
    const q = (input.value || '').trim().toLowerCase();
    if(q.length < 2){ close(); return; }
    const list = getActiveProducts().filter(p => String(p.name || '').toLowerCase().includes(q));
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

function initDynamicCategoryNav(){
  const nav = document.querySelector('nav.nav');
  if(!nav) return;

  const categories = (window.LV_RUNTIME_CATALOG && Array.isArray(window.LV_RUNTIME_CATALOG.categories))
    ? window.LV_RUNTIME_CATALOG.categories
    : [];
  if(!categories.length) return;

  nav.innerHTML = '';
  categories.forEach((c) => {
    const a = document.createElement('a');
    a.href = `category.html?cat=${encodeURIComponent(String(c.slug || c.name || '').trim())}`;
    setText(a, String(c.name || 'Categoria'));
    nav.appendChild(a);
  });
}

function initMobileDrawer(){
  const toggle = document.querySelector('[data-drawer-toggle]');
  const drawer = document.querySelector('[data-drawer]');
  const overlay = document.querySelector('[data-drawer-overlay]');
  const closeBtn = document.querySelector('[data-drawer-close]');
  if(!toggle || !drawer || !overlay || !closeBtn) return;

  let lastActive = null;
  let scrollY = 0;

  function isOpen(){ return document.body.classList.contains('drawer-open'); }

  function lockScroll(){
    scrollY = window.scrollY || 0;
    document.body.classList.add('scroll-lock');
    document.body.style.top = `-${scrollY}px`;
  }

  function unlockScroll(){
    document.body.classList.remove('scroll-lock');
    document.body.style.top = '';
    window.scrollTo(0, scrollY);
  }

  function setAria(open){
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    overlay.hidden = !open;
  }

  function focusables(){
    const list = drawer.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(list).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function onKeydown(e){
    if(!isOpen()) return;
    if(e.key === 'Escape'){
      e.preventDefault();
      close();
      return;
    }
    if(e.key !== 'Tab') return;

    const f = focusables();
    if(f.length === 0){ e.preventDefault(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    const active = document.activeElement;

    if(e.shiftKey){
      if(active === first || active === drawer){
        e.preventDefault();
        last.focus();
      }
    } else {
      if(active === last){
        e.preventDefault();
        first.focus();
      }
    }
  }

  function open(){
    if(isOpen()) return;
    lastActive = document.activeElement;
    document.body.classList.add('drawer-open');
    lockScroll();
    setAria(true);
    document.addEventListener('keydown', onKeydown);
    // Move foco para dentro do drawer
    closeBtn.focus();
  }

  function close(){
    if(!isOpen()) return;
    document.body.classList.remove('drawer-open');
    setAria(false);
    document.removeEventListener('keydown', onKeydown);
    unlockScroll();
    // Retorna foco para o acionador
    (lastActive && lastActive.focus) ? lastActive.focus() : toggle.focus();
  }

  toggle.addEventListener('click', () => { isOpen() ? close() : open(); });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  drawer.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a') : null;
    if(a) close();
  });

  // Fechar automaticamente se trocar para layout desktop
  const mq = window.matchMedia('(min-width: 901px)');
  mq.addEventListener('change', (e) => { if(e.matches) close(); });
}

function initAuthUI(){
  const headerActions = document.querySelector('.header-actions');
  if(!headerActions) return;

  let host = headerActions.querySelector('[data-auth-actions]');
  if(!host){
    host = document.createElement('div');
    host.className = 'auth-actions';
    host.setAttribute('data-auth-actions', '');
    const cartBtn = headerActions.querySelector('[data-cart-link]');
    if(cartBtn) headerActions.insertBefore(host, cartBtn);
    else headerActions.appendChild(host);
  }

  function clear(el){ while(el.firstChild) el.removeChild(el.firstChild); }

  function render(){
    clear(host);
    if(!session.isLoggedIn()){
      const a = document.createElement('a');
      a.className = 'btn btn-sm';
      a.href = session.buildLoginHref();
      a.setAttribute('aria-label', 'Entrar');
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden','true');
      icon.textContent = '👤';
      a.appendChild(icon);
      a.appendChild(document.createTextNode('Entrar'));
      host.appendChild(a);
    } else {
      const account = document.createElement('a');
      account.className = 'btn btn-sm';
      account.href = 'account.html';
      account.setAttribute('aria-label', 'Minha conta');
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden','true');
      icon.textContent = '👤';
      account.appendChild(icon);
      account.appendChild(document.createTextNode('Minha conta'));

      const logout = document.createElement('button');
      logout.className = 'btn btn-sm';
      logout.type = 'button';
      logout.setAttribute('aria-label', 'Sair');
      const iconOut = document.createElement('span');
      iconOut.setAttribute('aria-hidden','true');
      iconOut.textContent = '⎋';
      logout.appendChild(iconOut);
      logout.appendChild(document.createTextNode('Sair'));
      logout.addEventListener('click', () => {
        session.logout();
        window.location.href = 'index.html';
      });

      host.appendChild(account);
      host.appendChild(logout);
    }

    // Drawer (mobile): troca "Minha Conta" por "Entrar" quando necessário.
    const drawer = document.querySelector('[data-drawer]');
    if(drawer){
      const nav = drawer.querySelector('.drawer-nav');
      if(nav){
        const accountLink = nav.querySelector('a[href="account.html"]');
        if(accountLink){
          if(!session.isLoggedIn()){
            accountLink.href = session.buildLoginHref();
            setText(accountLink, 'Entrar');
            accountLink.removeAttribute('aria-label');
          } else {
            accountLink.href = 'account.html';
            setText(accountLink, 'Minha Conta');
            accountLink.removeAttribute('aria-label');
          }
        }

        // Garante um link/botão de "Sair" no drawer quando logado.
        const existingLogout = nav.querySelector('[data-logout-link]');
        if(session.isLoggedIn()){
          if(!existingLogout){
            const a = document.createElement('a');
            a.href = '#';
            a.setAttribute('data-logout-link', '');
            setText(a, 'Sair');
            a.addEventListener('click', (e) => {
              e.preventDefault();
              session.logout();
              window.location.href = 'index.html';
            });
            nav.appendChild(a);
          }
        } else {
          if(existingLogout) existingLogout.remove();
        }
      }
    }
  }

  render();
  window.addEventListener('lv:session', render);
  window.addEventListener('lv:logout', render);
}

export function setCanonical(url){
  const link = document.querySelector('link[rel="canonical"]');
  if(link) link.setAttribute('href', url);
}

export async function initCommon(){
  updateCartBadge();
  subscribeCart(() => updateCartBadge());

  // Catálogo deve ser carregado antes da busca/autocomplete.
  try { await ensureCatalogLoaded(); } catch { /* fallback silencioso */ }
  initDynamicCategoryNav();
  initSearch();
  initMobileDrawer();
  initAuthUI();

  const cartBtn = document.querySelector('[data-cart-link]');
  if(cartBtn){
    cartBtn.addEventListener('click', () => { window.location.href = 'cart.html'; });
  }
}

// Auto-init (comportamento original)
document.addEventListener('DOMContentLoaded', () => { initCommon(); });

// Compatibilidade: expõe algumas APIs no window.
window.updateCartBadge = updateCartBadge;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQty = updateCartQty;
window.cartLineItems = cartLineItems;
window.cartTotals = cartTotals;
window.renderProductCard = renderProductCard;
window.bindQuickAdd = bindQuickAdd;
window.toast = toast;
window.setCanonical = setCanonical;
window.initCommon = initCommon;
window.STORE = STORE;

