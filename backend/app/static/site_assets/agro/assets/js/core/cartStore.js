import { session } from './session.js';

const LEGACY_CART_KEY = 'lv_cart_v1';
const GUEST_ID_KEY = 'lv_guest_id_v1';
const CART_PREFIX = 'lv_cart_v2';

const bus = new EventTarget();
let _lastKey = null;

function _storeSlug(){
  const cfg = window.LV_CONFIG || {};
  return String(cfg.STORE_SLUG || 'default').trim().toLowerCase();
}

function _guestId(){
  let gid = String(localStorage.getItem(GUEST_ID_KEY) || '').trim();
  if(!gid){
    gid = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(GUEST_ID_KEY, gid);
  }
  return gid;
}

function _scopeId(){
  const u = session.getUser ? session.getUser() : null;
  const uid = Number(u && u.id);
  if(Number.isFinite(uid) && uid > 0) return `u_${uid}`;
  return _guestId();
}

function _cartKey(){
  return `${CART_PREFIX}:${_storeSlug()}:${_scopeId()}`;
}

function _safeRead(key){
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function _normalized(items){
  return (Array.isArray(items) ? items : []).map((it) => ({
    productSlug: String(it.productSlug || ''),
    variantSku: String(it.variantSku || ''),
    qty: Math.max(1, Math.min(99, Number(it.qty) || 1)),
    addedAt: Number(it.addedAt) || Date.now(),
  })).filter((it) => it.productSlug);
}

function _write(items){
  const key = _cartKey();
  localStorage.setItem(key, JSON.stringify(_normalized(items)));
  bus.dispatchEvent(new Event('change'));
  window.dispatchEvent(new CustomEvent('lv:cart', { detail: { key, items: getCart() } }));
}

function _mergeItems(a, b){
  const out = _normalized(a);
  for(const it of _normalized(b)){
    const existing = out.find((x) => x.productSlug === it.productSlug && x.variantSku === it.variantSku);
    if(existing){
      existing.qty = Math.max(1, Math.min(99, existing.qty + it.qty));
    } else {
      out.push(it);
    }
  }
  return out;
}

function _migrateLegacyIfNeeded(){
  const legacy = _safeRead(LEGACY_CART_KEY);
  if(!legacy.length) return;
  const current = _safeRead(_cartKey());
  if(!current.length){
    localStorage.setItem(_cartKey(), JSON.stringify(_normalized(legacy)));
  }
  localStorage.removeItem(LEGACY_CART_KEY);
}

function _onScopeMaybeChanged(){
  const key = _cartKey();
  if(_lastKey === null){
    _lastKey = key;
    _migrateLegacyIfNeeded();
    return;
  }
  if(key === _lastKey) return;

  const prevItems = _safeRead(_lastKey);
  const nextItems = _safeRead(key);
  if(prevItems.length){
    const merged = _mergeItems(nextItems, prevItems);
    localStorage.setItem(key, JSON.stringify(merged));
  }
  _lastKey = key;
  bus.dispatchEvent(new Event('change'));
  window.dispatchEvent(new CustomEvent('lv:cart', { detail: { key, items: getCart() } }));
}

window.addEventListener('lv:session', _onScopeMaybeChanged);
window.addEventListener('lv:logout', _onScopeMaybeChanged);
_onScopeMaybeChanged();

export function getCart(){
  return _safeRead(_cartKey());
}

export function setCart(items){
  _write(items);
}

export function clearCart(){
  localStorage.removeItem(_cartKey());
  _write([]);
}

export function cartCount(){
  return getCart().reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
}

export function addCartItem({ productSlug, variantSku, qty }){
  const cart = getCart();
  const p = String(productSlug || '');
  const v = String(variantSku || '');
  const q = Math.max(1, Math.min(99, Number(qty) || 1));

  const existing = cart.find((it) => it.productSlug === p && it.variantSku === v);
  if(existing) existing.qty = Math.max(1, Math.min(99, (Number(existing.qty) || 0) + q));
  else cart.push({ productSlug: p, variantSku: v, qty: q, addedAt: Date.now() });

  _write(cart);
}

export function removeCartItem(productSlug, variantSku){
  const p = String(productSlug || '');
  const v = String(variantSku || '');
  const cart = getCart().filter((it) => !(it.productSlug === p && it.variantSku === v));
  _write(cart);
}

export function updateCartItemQty(productSlug, variantSku, qty){
  const p = String(productSlug || '');
  const v = String(variantSku || '');
  const cart = getCart();
  const item = cart.find((it) => it.productSlug === p && it.variantSku === v);
  if(!item) return;
  item.qty = Math.max(1, Math.min(99, Number(qty) || 1));
  _write(cart);
}

export function subscribeCart(listener){
  const fn = () => listener(getCart());
  bus.addEventListener('change', fn);
  return () => bus.removeEventListener('change', fn);
}

export const CART_STORAGE_KEY = CART_PREFIX;
