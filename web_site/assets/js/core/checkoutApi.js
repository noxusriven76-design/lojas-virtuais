import { apiPost, ApiError } from './apiClient.js';
import { LV_CONFIG } from '../config.js';
import {
  STORE,
  ensureCatalogLoaded,
  getProductById,
} from '../products.js';

// ---------------------------------------------------------------------------
// Checkout API
//
// Objetivo:
// - Preferir endpoints reais quando existirem:
//     POST /checkout/quote
//     POST /orders
// - Se não existirem / offline, usar fallback (mock) com estrutura compatível.
//
// Quote (mínimo): { items, subtotal, shippingOptions, discounts, total }
// Create order (mínimo): { orderId, paymentInstructions? }
// ---------------------------------------------------------------------------

const LV = (window.LV_CONFIG || LV_CONFIG || { USE_MOCK_DATA: false });

// Reutiliza a mesma chave do mock de pedidos (customerApi) para melhor integração offline.
const MOCK_ORDERS_KEY = 'lv_mock_orders_v1';
const MOCK_ORDER_SEQ_KEY = 'lv_mock_order_seq_v1';

function _safeJsonParse(value, fallback){
  try { return JSON.parse(value); } catch { return fallback; }
}

function _readJson(key, fallback){
  return _safeJsonParse(localStorage.getItem(key), fallback);
}

function _writeJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function _useMock(){
  return Boolean(LV.USE_MOCK_DATA || window.__USE_MOCK_DATA__ === true);
}

function _shouldFallbackToMock(err){
  if(_useMock()) return true;
  if(!(err instanceof ApiError)) return false;
  return (err.status === 0 || err.status === 404 || err.status === 501);
}

function _normalizeBearer(token){
  const t = String(token || '').trim();
  if(!t) return '';
  return t.toLowerCase().startsWith('bearer ') ? t : ('Bearer ' + t);
}

function _stripBearer(token){
  const t = String(token || '').trim();
  if(!t) return '';
  return t.toLowerCase().startsWith('bearer ') ? t.slice(7).trim() : t;
}

function _mockTokenUserId(token){
  // Compatível com o formato do mock em customerApi: mock:{userId}:{ts}:{rand}
  const raw = _stripBearer(token);
  if(!raw || !raw.startsWith('mock:')) return null;
  const parts = raw.split(':');
  const id = Number(parts[1]);
  return Number.isFinite(id) ? id : null;
}

function _normalizeCep(cep){
  return String(cep || '').replace(/\D/g, '');
}

function _money(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _pickStoreSlug(payload){
  return String(payload?.store_slug || payload?.storeSlug || LV.STORE_SLUG || STORE.slug || '').trim();
}

function _enrichItems(orderItems){
  const list = Array.isArray(orderItems) ? orderItems : [];
  const out = [];

  for(const it of list){
    const productId = Number(it?.product_id ?? it?.productId);
    const variantId = Number(it?.variant_id ?? it?.variantId);
    const quantity = Math.max(1, Math.min(99, Number(it?.quantity) || 1));

    const product = getProductById(productId) || null;
    const variant = product ? (product.variants || []).find(v => Number(v.id) === variantId) : null;

    const unitPrice = variant ? _money(variant.price) : _money(product ? (product.sale_price || product.base_price) : 0);
    const lineTotal = unitPrice * quantity;

    const variantLabel = variant ? `${variant.color} • ${variant.size} • SKU ${variant.sku}` : '';
    out.push({
      product_id: productId,
      variant_id: variantId,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      product_name: product ? String(product.name || '') : '',
      variant_label: variantLabel,
      image_url: product ? String(product.image_url || '') : '',
    });
  }

  return out;
}

function _computeMockShippingOptions({ cep, items }){
  const digits = _normalizeCep(cep);
  if(digits.length !== 8) return [];

  // Replica a lógica simples do backend (shipping.py) para ficar consistente.
  const totalQty = (items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  let regionFactor = 1.25;
  if(digits.startsWith('0') || digits.startsWith('1')) regionFactor = 1.0;
  else if(digits.startsWith('2') || digits.startsWith('3') || digits.startsWith('4')) regionFactor = 1.15;

  const base = 12.0 * regionFactor;
  const perItem = 2.0 * totalQty;

  const pac = Math.round((base + perItem) * 100) / 100;
  const exp = Math.round(((base + perItem) * 1.5) * 100) / 100;

  return [
    { service: 'PAC', price: pac, eta_days: 6 },
    { service: 'EXPRESS', price: exp, eta_days: 3 },
  ];
}

function _pickSelectedShipping({ shippingOptions, shipping_service }){
  const opts = Array.isArray(shippingOptions) ? shippingOptions : [];
  const desired = String(shipping_service || '').trim();
  if(desired){
    const found = opts.find(o => String(o?.service || '').toUpperCase() === desired.toUpperCase());
    if(found) return found;
  }
  // fallback: menor preço
  if(!opts.length) return null;
  return opts.slice().sort((a,b) => _money(a?.price) - _money(b?.price))[0] || null;
}

function _normalizeShippingOptions(any){
  const list = Array.isArray(any) ? any : [];
  return list.map((o) => ({
    service: String(o?.service ?? o?.id ?? o?.code ?? '').trim() || 'Padrão',
    price: _money(o?.price ?? o?.amount ?? o?.value ?? 0),
    eta_days: Number.isFinite(Number(o?.eta_days ?? o?.etaDays ?? o?.eta ?? 0)) ? Number(o?.eta_days ?? o?.etaDays ?? o?.eta ?? 0) : 0,
  }));
}

function _normalizeDiscounts(any){
  if(Array.isArray(any)){
    return any.map((d) => ({
      code: String(d?.code ?? d?.coupon ?? d?.id ?? '').trim() || null,
      amount: _money(d?.amount ?? d?.value ?? d?.discount ?? 0),
      label: String(d?.label ?? d?.name ?? '').trim() || null,
    })).filter(d => d.amount > 0);
  }
  // suporta formatos simples: { discount: 10 } ou discount: 10
  if(any && typeof any === 'object'){
    const amount = _money(any.discount ?? any.amount ?? 0);
    if(amount > 0) return [{ code: any.code || null, amount, label: any.label || null }];
  }
  const n = _money(any);
  return (n > 0) ? [{ code: null, amount: n, label: null }] : [];
}

function _normalizeQuoteResponse(data, payload){
  const raw = (data && typeof data === 'object') ? data : null;
  if(!raw) return null;

  const items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw.lines) ? raw.lines : null);
  const enriched = items ? _enrichItems(items) : null;

  const subtotal = _money(raw.subtotal ?? raw.subtotal_amount ?? raw.subtotalAmount);
  const total = _money(raw.total ?? raw.total_amount ?? raw.totalAmount);

  const shippingOptions = _normalizeShippingOptions(
    raw.shippingOptions ?? raw.shipping_options ?? raw.shipping?.options ?? raw.shipping
  );

  const discounts = _normalizeDiscounts(raw.discounts ?? raw.discount ?? raw.promotions);

  // Se o endpoint não devolve campos essenciais, tenta manter compatibilidade.
  if(enriched && (subtotal > 0 || total > 0 || shippingOptions.length || discounts.length)){
    // Se subtotal não veio, calcula.
    const computedSubtotal = subtotal > 0 ? subtotal : enriched.reduce((s,it)=>s+_money(it.line_total),0);

    // Se total não veio, calcula com base no shipping_service da requisição.
    let computedTotal = total;
    if(!(computedTotal > 0)){
      const selected = _pickSelectedShipping({ shippingOptions, shipping_service: payload?.shipping_service });
      const ship = selected ? _money(selected.price) : 0;
      const disc = discounts.reduce((s,d)=>s+_money(d.amount),0);
      computedTotal = Math.max(0, computedSubtotal + ship - disc);
    }

    return {
      items: enriched,
      subtotal: computedSubtotal,
      shippingOptions,
      discounts,
      total: computedTotal,
    };
  }

  return null;
}

async function _composeQuote(payload){
  const storeSlug = _pickStoreSlug(payload);
  const cep = _normalizeCep(payload?.cep);
  const couponCode = String(payload?.coupon_code || payload?.couponCode || '').trim();

  try { await ensureCatalogLoaded(); } catch { /* fallback */ }

  const items = _enrichItems(payload?.items);
  const subtotal = items.reduce((sum, it) => sum + _money(it.line_total), 0);

  // Shipping options
  let shippingOptions = [];
  if(cep.length === 8){
    try {
      const ship = await apiPost(`/public/${encodeURIComponent(storeSlug)}/shipping/quote`, {
        cep,
        items: (payload?.items || []).map(it => ({
          variant_id: Number(it?.variant_id ?? it?.variantId),
          quantity: Math.max(1, Math.min(99, Number(it?.quantity) || 1)),
        })),
      });
      shippingOptions = _normalizeShippingOptions(ship?.options ?? ship?.shippingOptions ?? []);
    } catch (err){
      // Se não existe, faz mock local.
      if(_shouldFallbackToMock(err)) shippingOptions = _computeMockShippingOptions({ cep, items });
      else throw err;
    }
  }

  // Discounts
  let discounts = [];
  if(couponCode){
    try {
      const coupon = await apiPost(`/public/${encodeURIComponent(storeSlug)}/coupons/validate`, {
        code: couponCode,
        subtotal,
      });
      if(coupon && coupon.valid){
        const amount = _money(coupon.discount);
        if(amount > 0) discounts = [{ code: coupon.code || couponCode, amount, label: 'Cupom' }];
    } catch (err){
      // Se não existe, ignora desconto.
      if(!_shouldFallbackToMock(err)) throw err;
    }
  }

  const discTotal = discounts.reduce((sum, d) => sum + _money(d.amount), 0);
  const selected = _pickSelectedShipping({ shippingOptions, shipping_service: payload?.shipping_service });
  const shipPrice = selected ? _money(selected.price) : 0;

  return {
    items,
    subtotal,
    shippingOptions,
    discounts,
    total: Math.max(0, subtotal + shipPrice - discTotal),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCheckoutQuote(payload){
  const body = payload || {};
  if(_useMock()) return _composeQuote(body);

  try {
    const res = await apiPost('/checkout/quote', body);
    const norm = _normalizeQuoteResponse(res, body);
    return norm || _composeQuote(body);
  } catch (err){
    if(_shouldFallbackToMock(err)) return _composeQuote(body);
    throw err;
  }
}

function _paymentInstructions({ paymentMethod, orderId, total }){
  const m = String(paymentMethod || '').toLowerCase();
  const money = (val) => {
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(_money(val));
    } catch {
      return String(val);
    }
  };

  if(m === 'pix'){
    const key = `00020126580014BR.GOV.BCB.PIX0136mock-${String(orderId || '')}52040000530398654${String(Math.round(_money(total) * 100)).padStart(4,'0')}5802BR5920Aurora Clothing6009SAO PAULO62130509${String(orderId || '').slice(-5) || '00000'}6304ABCD`;
    return `Pague via PIX\n\n• Pedido: ${orderId}\n• Valor: ${money(total)}\n\nCopia e cola:\n${key}\n\nApós o pagamento, a confirmação pode levar alguns minutos.`;
  }

  if(m === 'boleto'){
    const line = `34191.79001 01043.510047 91020.150008 5 ${String(orderId || '').slice(-5).padStart(5,'0')}000${String(Math.round(_money(total) * 100)).padStart(10,'0')}`;
    return `Boleto (placeholder)\n\n• Pedido: ${orderId}\n• Valor: ${money(total)}\n\nLinha digitável:\n${line}\n\nVencimento: ${new Intl.DateTimeFormat('pt-BR').format(new Date(Date.now() + 2*24*60*60*1000))}`;
  }

  if(m === 'card'){
    return 'Cartão (placeholder): seu pagamento será processado e você receberá a confirmação na tela e por e-mail (se integrado).';
  }

  return '';
}

function _nextMockOrderId(){
  const cur = Number(localStorage.getItem(MOCK_ORDER_SEQ_KEY) || '1100');
  const next = Number.isFinite(cur) ? cur + 1 : 1101;
  localStorage.setItem(MOCK_ORDER_SEQ_KEY, String(next));
  return next;
}

function _mockCreateOrder(orderPayload, { token='', paymentMethod='' }={}){
  const orderId = _nextMockOrderId();
  const userId = _mockTokenUserId(token) || 0;

  // salva um pedido mínimo no mock para aparecer em "Meus pedidos".
  const existing = _readJson(MOCK_ORDERS_KEY, []);
  const list = Array.isArray(existing) ? existing : [];

  const storeSlug = _pickStoreSlug(orderPayload);
  const items = _enrichItems(orderPayload?.items);
  const subtotal = items.reduce((s,it)=>s+_money(it.line_total),0);
  const shippingPrice = _money(orderPayload?.shipping_price);
  const total = Math.max(0, subtotal + shippingPrice);

  const addr = orderPayload?.address || {};
  const addressLine = [
    String(addr.street || '').trim(),
    String(addr.number || '').trim(),
    String(addr.neighborhood || '').trim(),
    String(addr.city || '').trim(),
    String(addr.state || '').trim(),
  ].filter(Boolean).join(' - ');

  list.unshift({
    id: orderId,
    user_id: userId,
    store_slug: storeSlug,
    number: `AUR-${orderId}`,
    status: 'Confirmado',
    created_at: new Date().toISOString(),
    currency: 'BRL',
    items: items.map(it => ({
      product_slug: String(it.product_id || ''),
      name: it.product_name || 'Produto',
      qty: it.quantity,
      unit_price: it.unit_price,
    })),
    shipping: {
      method: String(orderPayload?.shipping_service || 'Padrão'),
      eta_days: Number(orderPayload?.shipping_eta_days) || 0,
      address: addressLine,
    },
    total,
  });

  _writeJson(MOCK_ORDERS_KEY, list);

  return {
    orderId,
    paymentInstructions: _paymentInstructions({ paymentMethod, orderId, total }),
  };
}

function _normalizeOrderResponse(res){
  const raw = (res && typeof res === 'object') ? res : {};
  const orderId = raw.orderId ?? raw.order_id ?? raw.id ?? raw.number ?? raw._id ?? null;
  const paymentInstructions = raw.paymentInstructions ?? raw.payment_instructions ?? raw.payment?.instructions ?? null;
  return {
    orderId,
    paymentInstructions: paymentInstructions ? String(paymentInstructions) : null,
    raw,
  };
}

export async function createOrder(orderPayload, { token='', paymentMethod='' }={}){
  const body = orderPayload || {};
  if(_useMock()) return _mockCreateOrder(body, { token, paymentMethod });

  const headers = {};
  const auth = _normalizeBearer(token);
  if(auth) headers['Authorization'] = auth;

  const strippedForBackend = () => ({
    store_slug: body.store_slug,
    items: body.items,
    shipping_service: body.shipping_service,
    shipping_price: body.shipping_price,
    shipping_eta_days: body.shipping_eta_days,
    address: body.address,
  });

  try {
    const res = await apiPost('/orders', body, { headers });
    return _normalizeOrderResponse(res);
  } catch (err){
    let handledErr = err;
    let status = (handledErr && typeof handledErr.status === 'number') ? handledErr.status : 0;

    // Alguns backends podem rejeitar campos extras (422). Tenta novamente apenas com o schema mínimo.
    if(status === 422){
      const stripped = strippedForBackend();
      const hasExtra = Object.keys(body || {}).some(k => !(k in stripped));
      if(hasExtra){
        try {
          const res2 = await apiPost('/orders', stripped, { headers });
          return _normalizeOrderResponse(res2);
        } catch (err2){
          handledErr = err2;
          status = (handledErr && typeof handledErr.status === 'number') ? handledErr.status : 0;
        }
      }
    }

    // Se o backend não existir / offline, cai no mock.
    if(_shouldFallbackToMock(handledErr)) return _mockCreateOrder(body, { token, paymentMethod });

    // Se não está autenticado e não há token, permite fallback.
    if((status === 401 || status === 403) && !String(token || '').trim()){
      return _mockCreateOrder(body, { token, paymentMethod });
    }

    throw handledErr;
  }
}
