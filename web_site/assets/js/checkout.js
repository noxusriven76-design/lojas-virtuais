function validateEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function validateCep(cep){
  const d = (cep || '').replace(/\D/g,'');
  return d.length === 8;
}

function showError(input, msg){
  const wrap = input.closest('.field');
  const el = wrap?.querySelector('[data-error]');
  if(el){ el.textContent = msg || ''; }
  input.setAttribute('aria-invalid', msg ? 'true':'false');
}

function clearErrors(form){
  form.querySelectorAll('[aria-invalid="true"]').forEach(i => i.setAttribute('aria-invalid','false'));
  form.querySelectorAll('[data-error]').forEach(e => e.textContent='');
}

const COUPON_KEY = 'lv_coupon_v1';
const SHIPPING_KEY = 'lv_shipping_v1';

function escapeHtml(str){
  return String(str || '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function readCoupon(){
  try{ return JSON.parse(localStorage.getItem(COUPON_KEY) || 'null'); }
  catch(e){ return null; }
}

function writeCoupon(obj){
  if(!obj){ localStorage.removeItem(COUPON_KEY); return; }
  localStorage.setItem(COUPON_KEY, JSON.stringify(obj));
}

function readShipping(){
  try{ return JSON.parse(localStorage.getItem(SHIPPING_KEY) || 'null'); }
  catch(e){ return null; }
}

function writeShipping(obj){
  if(!obj){ localStorage.removeItem(SHIPPING_KEY); return; }
  localStorage.setItem(SHIPPING_KEY, JSON.stringify(obj));
}

function _cleanCep(cep){ return String(cep || '').replace(/\D/g,''); }

async function quoteShipping(cep){
  const cfg = (window.LV_CONFIG || { STORE_SLUG: STORE?.slug || '', API_BASE_URL: 'http://localhost:8000/api/v1' });
  const digits = _cleanCep(cep);
  if(digits.length !== 8) return null;

  const totals = cartTotals();
  const items = totals.items
    .map(it => ({ product_id: it.productId, variant_id: it.variantId, quantity: it.qty }))
    .filter(it => it.product_id && it.variant_id && it.quantity);

  if(items.length === 0) return null;

  const res = await fetch(`${String(cfg.API_BASE_URL).replace(/\/+$/,'')}/public/${encodeURIComponent(cfg.STORE_SLUG || '')}/shipping/quote`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ cep: digits, items })
  });
  const data = await res.json().catch(() => null);
  if(!res.ok) return null;
  const opts = Array.isArray(data?.options) ? data.options : [];
  if(opts.length === 0) return { cep: digits, option: null };

  // Backend retorna opções já ordenadas (mais barata primeiro)
  const o = opts[0];
  return { cep: digits, option: { service: o.service, price: Number(o.price || 0), eta_days: Number(o.eta_days || 0) } };
}

function couponReasonToPt(reason){
  const map = {
    invalid_code: 'Cupom inválido.',
    not_found: 'Cupom não encontrado.',
    inactive: 'Cupom inativo.',
    expired: 'Cupom expirado.',
    usage_limit_total_reached: 'Esse cupom já atingiu o limite de uso.',
    usage_limit_per_user_reached: 'Você já usou esse cupom o máximo de vezes permitido.',
    login_required: 'Entre na sua conta para usar este cupom.',
    subtotal_zero: 'Seu carrinho está vazio.',
    discount_zero: 'Cupom sem desconto aplicável.'
  };
  return map[reason] || 'Não foi possível aplicar o cupom.';
}

async function applyCoupon(code, subtotal){
  const cfg = (window.LV_CONFIG || { STORE_SLUG: STORE?.slug || '', API_BASE_URL: 'http://localhost:8000/api/v1' });
  const res = await fetch(`${String(cfg.API_BASE_URL).replace(/\/+$/,'')}/public/${encodeURIComponent(cfg.STORE_SLUG || '')}/coupons/validate`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ code, subtotal })
  });
  if(!res.ok){
    return { ok:false, message: 'Falha ao validar cupom.' };
  }
  const data = await res.json();
  if(!data.valid){
    return { ok:false, message: couponReasonToPt(data.reason) };
  }
  return { ok:true, discount: Number(data.discount || 0), code: data.code };
}

function renderOrderSummary(){
  const totals = cartTotals();
  const wrap = document.querySelector('[data-order-summary]');
  if(!wrap) return;

  if(totals.items.length === 0){
    wrap.innerHTML = `<div class="notice">Seu carrinho está vazio. <a href="index.html">Voltar para a vitrine</a>.</div>`;
    return;
  }

  const s = readShipping();
  const shippingPrice = s?.option?.price ? Number(s.option.price) : 0;

  const c = readCoupon();
  const discount = c?.discount ? Number(c.discount) : 0;

  let total = totals.subtotal + shippingPrice - discount;
  if(total < 0) total = 0;

  wrap.innerHTML = `
    <div class="summary-row"><span>Subtotal</span><strong>${formatBRL(totals.subtotal)}</strong></div>
    ${discount > 0 ? `<div class="summary-row"><span>Desconto (${escapeHtml(c.code)})</span><strong>- ${formatBRL(discount)}</strong></div>` : ''}
    <div class="summary-row"><span>Frete</span><strong>${s?.option ? formatBRL(shippingPrice) : '—'}</strong></div>
    <div class="summary-row"><span>Total</span><strong>${formatBRL(total)}</strong></div>
    ${s?.option ? `<div class="notice" style="margin-top:12px;">${escapeHtml(s.option.service)} • Entrega estimada: ${Number(s.option.eta_days||0)} dias úteis</div>` : `<div class="notice" style="margin-top:12px;">Informe o CEP para calcular o frete.</div>`}
  `;

  // Canonical deve refletir a página real existente (HTML estático)
  setCanonical(`${STORE.url}/checkout.html`);
}

function bindCoupon(){
  const form = document.querySelector('[data-coupon-form]');
  if(!form) return;

  const input = form.querySelector('input[name="coupon"]');
  const msg = form.querySelector('[data-coupon-message]');

  // Pre-fill
  const c = readCoupon();
  if(c?.code){ input.value = c.code; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';

    const code = (input.value || '').trim();
    if(!code){
      writeCoupon(null);
      renderOrderSummary();
      msg.textContent = 'Cupom removido.';
      return;
    }

    const totals = cartTotals();
    const out = await applyCoupon(code, totals.subtotal);

    if(!out.ok){
      writeCoupon(null);
      renderOrderSummary();
      msg.textContent = out.message;
      return;
    }

    writeCoupon({ code: out.code, discount: out.discount });
    msg.textContent = 'Cupom aplicado.';
    renderOrderSummary();
  });
}

function bindCheckout(){
  const form = document.querySelector('[data-checkout-form]');
  if(!form) return;

  const cepInput = form.querySelector('[name="cep"]');
  let cepTimer = null;

  async function refreshShipping(){
    if(!cepInput) return;
    const digits = _cleanCep(cepInput.value);
    if(digits.length !== 8){ writeShipping(null); renderOrderSummary(); return; }

    const current = readShipping();
    if(current?.cep === digits && current?.option) return; // já calculado

    const q = await quoteShipping(digits);
    if(q && q.option){
      writeShipping(q);
    } else {
      writeShipping(null);
    }
    renderOrderSummary();
  }

  // recalcula ao digitar / sair do campo (debounce)
  if(cepInput){
    const schedule = () => {
      if(cepTimer) clearTimeout(cepTimer);
      cepTimer = setTimeout(() => { refreshShipping(); }, 450);
    };
    cepInput.addEventListener('input', schedule);
    cepInput.addEventListener('blur', refreshShipping);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);

    const name = form.querySelector('[name="name"]');
    const email = form.querySelector('[name="email"]');
    const phone = form.querySelector('[name="phone"]');
    const cep = form.querySelector('[name="cep"]');
    const address = form.querySelector('[name="address"]');
    const number = form.querySelector('[name="number"]');
    const city = form.querySelector('[name="city"]');
    const state = form.querySelector('[name="state"]');
    const payment = form.querySelector('[name="payment"]:checked');

    let ok = true;

    if(!name.value.trim()){ showError(name, 'Informe seu nome.'); ok = false; }
    if(!validateEmail(email.value)){ showError(email, 'Informe um e-mail válido.'); ok = false; }
    if((phone.value || '').replace(/\D/g,'').length < 10){ showError(phone, 'Informe um telefone com DDD.'); ok = false; }
    if(!validateCep(cep.value)){ showError(cep, 'Informe um CEP válido (8 dígitos).'); ok = false; }
    if(!address.value.trim()){ showError(address, 'Informe o endereço.'); ok = false; }
    if(!number.value.trim()){ showError(number, 'Informe o número.'); ok = false; }
    if(!city.value.trim()){ showError(city, 'Informe a cidade.'); ok = false; }
    if(!state.value){ showError(state, 'Selecione o estado.'); ok = false; }
    if(!payment){ toast('Selecione uma forma de pagamento.'); ok = false; }

    if(!ok){
      const first = form.querySelector('[aria-invalid="true"]');
      first?.focus();
      return;
    }

    // Validação de frete no backend (contexto da loja)
    await refreshShipping();
    const s = readShipping();
    if(!s?.option){
      showError(cep, 'Não foi possível calcular o frete. Verifique o CEP.');
      cep.focus();
      return;
    }

    // Placeholder de finalização: a criação real do pedido deve ocorrer no backend.
    toast('Pedido criado (UI). Integre com o backend para processar pagamento e pedido.');

    // opcional: limpar carrinho e cupom
    localStorage.removeItem(CART_KEY);
    writeCoupon(null);
    updateCartBadge();

    const okMsg = document.querySelector('[data-checkout-success]');
    if(okMsg){
      okMsg.textContent = 'Obrigado. Seu pedido foi registrado (placeholder). Você receberá um e-mail com os próximos passos.';
      okMsg.classList.add('success');
    }

    form.reset();
    writeShipping(null);
    renderOrderSummary();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if(typeof ensureCatalogLoaded === 'function'){
    try{ await ensureCatalogLoaded(); } catch(_){ /* fallback */ }
  }
  renderOrderSummary();
  bindCoupon();
  bindCheckout();
});
