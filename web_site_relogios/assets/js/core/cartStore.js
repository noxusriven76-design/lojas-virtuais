const CART_KEY = 'lv_cart_v1';

const bus = new EventTarget();

function _safeRead(){
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}

function _write(items){
  localStorage.setItem(CART_KEY, JSON.stringify(items || []));
  bus.dispatchEvent(new Event('change'));
  window.dispatchEvent(new CustomEvent('lv:cart', { detail: { items: items || [] } }));
}

export function getCart(){
  return _safeRead();
}

export function setCart(items){
  _write(Array.isArray(items) ? items : []);
}

export function clearCart(){
  localStorage.removeItem(CART_KEY);
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

  const existing = cart.find(it => it.productSlug === p && it.variantSku === v);
  if(existing) existing.qty = Math.max(1, Math.min(99, (Number(existing.qty) || 0) + q));
  else cart.push({ productSlug: p, variantSku: v, qty: q, addedAt: Date.now() });

  _write(cart);
}

export function removeCartItem(productSlug, variantSku){
  const p = String(productSlug || '');
  const v = String(variantSku || '');
  const cart = getCart().filter(it => !(it.productSlug === p && it.variantSku === v));
  _write(cart);
}

export function updateCartItemQty(productSlug, variantSku, qty){
  const p = String(productSlug || '');
  const v = String(variantSku || '');
  const cart = getCart();
  const item = cart.find(it => it.productSlug === p && it.variantSku === v);
  if(!item) return;
  item.qty = Math.max(1, Math.min(99, Number(qty) || 1));
  _write(cart);
}

export function subscribeCart(listener){
  const fn = () => listener(getCart());
  bus.addEventListener('change', fn);
  return () => bus.removeEventListener('change', fn);
}

export const CART_STORAGE_KEY = CART_KEY;
