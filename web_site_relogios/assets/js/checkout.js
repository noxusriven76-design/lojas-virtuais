import { setText } from './utils/sanitize.js';
import { renderEmptyState, renderErrorState } from './ui/states.js';
import { STORE, ensureCatalogLoaded, formatBRL } from './products.js';
import { cartTotals, toast, setCanonical } from './main.js';
import { clearCart } from './core/cartStore.js';
import { session } from './core/session.js';
import { getCheckoutQuote, createOrder } from './core/checkoutApi.js';

// ---------------------------------------------------------------------------
// Checkout (fluxo):
// 1) Carrega itens do carrinho.
// 2) Calcula quote (subtotal, frete, descontos, total).
// 3) Cria pedido (POST /orders) e redireciona para thank-you.html.
// ---------------------------------------------------------------------------

const COUPON_KEY = 'lv_coupon_v1';
const CHECKOUT_STATE_KEY = 'lv_checkout_state_v1';
const LAST_ORDER_KEY = 'lv_last_order_v1';

function $(sel){
  return (typeof sel === 'string') ? document.querySelector(sel) : sel;
}

function clearEl(el){
  if(!el) return;
  while(el.firstChild) el.removeChild(el.firstChild);
}

function readJson(key, fallback=null){
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

function writeJson(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function readCoupon(){
  return String(localStorage.getItem(COUPON_KEY) || '').trim();
}

function writeCoupon(code){
  const c = String(code || '').trim();
  if(!c) localStorage.removeItem(COUPON_KEY);
  else localStorage.setItem(COUPON_KEY, c);
}

function readCheckoutState(){
  const s = readJson(CHECKOUT_STATE_KEY, {}) || {};
  return {
    cep: String(s.cep || '').trim(),
    shipping_service: String(s.shipping_service || '').trim(),
  };
}

function writeCheckoutState(patch){
  const prev = readCheckoutState();
  writeJson(CHECKOUT_STATE_KEY, { ...prev, ...(patch || {}) });
}

function setError(elOrSelector, message){
  const el = $(elOrSelector);
  if(!el) return;
  const msg = String(message || '').trim();
  if(!msg){
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  setText(el, msg);
}

function setButtonLoading(button, isLoading, { idleText='Finalizar pedido', loadingText='Enviando...' }={}){
  if(!button) return;
  const loading = Boolean(isLoading);
  button.disabled = loading;
  button.setAttribute('aria-disabled', loading ? 'true' : 'false');
  setText(button, loading ? loadingText : idleText);
}

function pickPaymentMethod(form){
  const inputs = form ? Array.from(form.querySelectorAll('input[name="payment"]')) : [];
  const checked = inputs.find(i => i && i.checked);
  return checked ? String(checked.value || '').trim() : '';
}

function normalizeCep(val){
  return String(val || '').replace(/\D/g, '');
}

function normalizePhone(val){
  return String(val || '').replace(/\D/g, '').slice(0, 15);
}

function validateRequired(value){
  return Boolean(String(value || '').trim());
}

function validateCep(cep){
  const c = normalizeCep(cep);
  return c.length === 8;
}

function validateForm(form){
  if(!form) return { ok:false, first:null };

  const fields = Array.from(form.querySelectorAll('[name]'));
  let firstInvalid = null;

  // Limpa mensagens antigas
  Array.from(form.querySelectorAll('[data-error]')).forEach(el => setText(el, ''));

  for(const el of fields){
    if(!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    const name = el.getAttribute('name') || '';

    // radios: valida apenas o grupo
    if(el.type === 'radio') continue;

    const required = el.hasAttribute('required');
    const value = el.value;

    let valid = true;
    let msg = '';

    if(required && !validateRequired(value)){
      valid = false;
      msg = 'Campo obrigatrio.';
    }

    if(valid && name === 'cep' && !validateCep(value)){
      valid = false;
      msg = 'Informe um CEP vlido (8 dgitos).';
    }

    if(valid && name === 'phone' && normalizePhone(value).length < 10){
      valid = false;
      msg = 'Informe um telefone vlido.';
    }

    if(!valid){
      const err = el.closest('.field')?.querySelector('[data-error]');
      if(err) setText(err, msg);
      el.setAttribute('aria-invalid', 'true');
      if(!firstInvalid) firstInvalid = el;
    } else {
      el.removeAttribute('aria-invalid');
    }
  }

  // payment radio
  const payment = pickPaymentMethod(form);
  if(!payment){
    const group = form.querySelector('input[name="payment"]');
    if(group) group.setAttribute('aria-invalid', 'true');
    if(!firstInvalid) firstInvalid = group;
  } else {
    const group = form.querySelector('input[name="payment"]');
    if(group) group.removeAttribute('aria-invalid');
  }

  return { ok: !firstInvalid, first: firstInvalid };
}

function buildOrderItemsFromCart(){
  const totals = cartTotals();
  const items = Array.isArray(totals?.items) ? totals.items : [];

  return items
    .map(it => ({
      product_id: Number(it.productId),
      variant_id: Number(it.variantId),
      quantity: Math.max(1, Math.min(99, Number(it.qty) || 1)),
      // extras teis para UI
      productSlug: it.productSlug,
      variantSku: it.variantSku,
      product_name: it.product?.name,
      variant_label: it.variant ? `${it.variant.color}  ${it.variant.size}  SKU ${it.variant.sku}` : '',
      image_url: it.product?.image_url,
      line_total: Number(it.lineTotal) || 0,
      unit_price: Number(it.unitPrice) || 0,
    }))
    .filter(it => Number.isFinite(it.product_id) && it.product_id > 0 && Number.isFinite(it.variant_id) && it.variant_id > 0);
}

function renderShippingOptions(container, options, selectedService, onSelect){
  if(!container) return;
  clearEl(container);

  const list = Array.isArray(options) ? options : [];
  if(!list.length){
    const p = document.createElement('p');
    p.className = 'help';
    setText(p, 'Informe um CEP para ver opes de frete.');
    container.appendChild(p);
    return;
  }

  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '8px';

  for(const opt of list){
    const service = String(opt?.service || opt?.id || '').trim();
    if(!service) continue;

    const label = document.createElement('label');
    label.className = 'label';
    label.style.display = 'flex';
    label.style.gap = '8px';
    label.style.alignItems = 'center';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'shipping_service';
    radio.value = service;
    radio.checked = (service === selectedService);

    const txt = document.createElement('span');
    const price = Number(opt?.price) || 0;
    const eta = (opt?.eta_days != null) ? Number(opt.eta_days) : null;
    const etaTxt = (eta != null && Number.isFinite(eta)) ? `  ${eta} dia(s)` : '';
    setText(txt, `${service}  ${formatBRL(price)}${etaTxt}`);

    radio.addEventListener('change', () => {
      if(typeof onSelect === 'function') onSelect(service);
    });

    label.appendChild(radio);
    label.appendChild(txt);
    wrap.appendChild(label);
  }

  container.appendChild(wrap);
}

function renderOrderSummary(container, quote, selectedShipping){
  if(!container) return;
  clearEl(container);

  const subtotal = Number(quote?.subtotal) || 0;
  const shipping = selectedShipping ? (Number(selectedShipping.price) || 0) : 0;
  const discounts = Array.isArray(quote?.discounts) ? quote.discounts : [];
  const discountTotal = discounts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const total = (Number(quote?.total) || 0) || Math.max(0, subtotal + shipping - discountTotal);

  const row = (label, value, { strong=false }={}) => {
    const div = document.createElement('div');
    div.className = 'summary-row';
    const s = document.createElement('span');
    setText(s, label);
    const v = document.createElement(strong ? 'strong' : 'span');
    setText(v, value);
    div.appendChild(s);
    div.appendChild(v);
    return div;
  };

  container.appendChild(row('Subtotal', formatBRL(subtotal)));

  if(selectedShipping){
    const eta = (selectedShipping.eta_days != null) ? Number(selectedShipping.eta_days) : null;
    const etaTxt = (eta != null && Number.isFinite(eta)) ? ` (${eta} dia(s))` : '';
    container.appendChild(row(`Frete  ${String(selectedShipping.service || '')}${etaTxt}`, formatBRL(shipping)));
  } else {
    container.appendChild(row('Frete', formatBRL(0)));
  }

  for(const d of discounts){
    const code = d?.code ? ` (${String(d.code)})` : '';
    const label = d?.label ? String(d.label) : 'Desconto';
    const amount = Number(d?.amount) || 0;
    if(amount > 0){
      container.appendChild(row(`${label}${code}`, `- ${formatBRL(amount)}`));
    }
  }

  const hr = document.createElement('hr');
  hr.className = 'sep';
  container.appendChild(hr);
  container.appendChild(row('Total', formatBRL(total), { strong:true }));

  const small = document.createElement('p');
  small.className = 'help';
  setText(small, 'Totais sujeitos  validao do backend.');
  container.appendChild(small);
}

export function initCheckout(){
  const authOk = session.requireAuth({ validate: true });
  if(!authOk) return;

  // Canonical deve refletir a pgina real existente (HTML esttico)
  setCanonical(`${STORE.url}/checkout.html`);

  const form = document.querySelector('[data-checkout-form]');
  const couponForm = document.querySelector('[data-coupon-form]');
  const couponInput = couponForm ? couponForm.querySelector('input[name="coupon"]') : null;
  const couponMsg = document.querySelector('[data-coupon-message]');

  const shippingOptionsEl = document.querySelector('[data-shipping-options]');
  const shippingMsg = document.querySelector('[data-shipping-message]');
  const summaryEl = document.querySelector('[data-order-summary]');

  const submitBtn = document.querySelector('[data-checkout-submit]');
  const submitErr = document.querySelector('[data-checkout-error]');

  if(!form || !summaryEl) return;

  // Default do pagamento
  const paymentInputs = Array.from(form.querySelectorAll('input[name="payment"]'));
  if(paymentInputs.length && !paymentInputs.some(i => i.checked)){
    paymentInputs[0].checked = true;
  }

  // Restaura estado
  const st = readCheckoutState();
  const cepInput = form.querySelector('input[name="cep"]');
  if(cepInput && st.cep && !cepInput.value) cepInput.value = st.cep;

  if(couponInput){
    const c = readCoupon();
    if(c) couponInput.value = c;
  }

  let quote = null;
  let selectedShippingService = String(st.shipping_service || '').trim();

  let quoteReqId = 0;

  function currentSelectedShipping(){
    const opts = Array.isArray(quote?.shippingOptions) ? quote.shippingOptions : [];
    if(!opts.length) return null;
    const found = opts.find(o => String(o?.service || '').trim() === selectedShippingService);
    if(found) return found;
    // fallback: menor preo
    return opts.slice().sort((a,b)=>(Number(a.price)||0)-(Number(b.price)||0))[0] || null;
  }

  function setCouponMessage(text){
    if(!couponMsg) return;
    setText(couponMsg, String(text || ''));
  }

  function setShippingMessage(text){
    if(!shippingMsg) return;
    setText(shippingMsg, String(text || ''));
  }

  async function refreshQuote({ showToastOnError=false }={}){
    const reqId = ++quoteReqId;

    setError(submitErr, '');
    setShippingMessage('Calculando...');
    clearEl(summaryEl);
    const skeleton = document.createElement('div');
    skeleton.className = 'state';
    const h = document.createElement('h3');
    setText(h, 'Calculando valores...');
    const p = document.createElement('p');
    setText(p, 'Aguarde um instante.');
    skeleton.appendChild(h);
    skeleton.appendChild(p);
    summaryEl.appendChild(skeleton);

    try { await ensureCatalogLoaded(); } catch { /* fallback silencioso */ }

    const items = buildOrderItemsFromCart();
    if(items.length === 0){
      quote = null;
      setShippingMessage('');
      clearEl(summaryEl);
      renderEmptyState(summaryEl, {
        title: 'Seu carrinho est vazio',
        message: 'Adicione itens para continuar com o checkout.',
        primaryAction: { label: 'Ver catlogo', href: 'category.html' },
        secondaryAction: { label: 'Ir para o carrinho', href: 'cart.html' },
      });
      if(submitBtn) submitBtn.disabled = true;
      return;
    }

    const cep = cepInput ? normalizeCep(cepInput.value) : '';
    writeCheckoutState({ cep });

    const couponCode = couponInput ? String(couponInput.value || '').trim() : readCoupon();

    const payload = {
      store_slug: STORE.slug,
      items: items.map(it => ({ product_id: it.product_id, variant_id: it.variant_id, quantity: it.quantity })),
      cep,
      coupon_code: couponCode || null,
      shipping_service: selectedShippingService || null,
    };

    const data = await getCheckoutQuote(payload);
    if(reqId !== quoteReqId) return; // ignora corrida

    quote = data;

    const opts = Array.isArray(quote?.shippingOptions) ? quote.shippingOptions : [];
    if(opts.length){
      // garante seleo
      const ok = opts.some(o => String(o?.service || '').trim() === selectedShippingService);
      if(!ok){
        const cheapest = opts.slice().sort((a,b)=>(Number(a.price)||0)-(Number(b.price)||0))[0];
        selectedShippingService = cheapest ? String(cheapest.service || '') : '';
      }
      writeCheckoutState({ shipping_service: selectedShippingService });
    }

    renderShippingOptions(shippingOptionsEl, opts, selectedShippingService, (service) => {
      selectedShippingService = String(service || '').trim();
      writeCheckoutState({ shipping_service: selectedShippingService });
      // total recalculado localmente usando o quote atual
      renderOrderSummary(summaryEl, quote, currentSelectedShipping());
    });

    if(!validateCep(cep)){
      setShippingMessage('Informe um CEP vlido para calcular o frete.');
    } else if(!opts.length){
      setShippingMessage('No encontramos opes de frete para este CEP.');
    } else {
      setShippingMessage('');
    }

    // Cupom
    if(couponCode){
      const discounts = Array.isArray(quote?.discounts) ? quote.discounts : [];
      const totalDiscount = discounts.reduce((s,d)=>s+(Number(d.amount)||0),0);
      if(totalDiscount > 0){
        writeCoupon(couponCode);
        setCouponMessage(`Cupom aplicado: - ${formatBRL(totalDiscount)}.`);
      } else {
        setCouponMessage('Cupom informado, mas sem desconto aplicado.');
      }
    } else {
      writeCoupon('');
      setCouponMessage('');
    }

    renderOrderSummary(summaryEl, quote, currentSelectedShipping());

    if(submitBtn) submitBtn.disabled = false;
  } catch (err){
      if(reqId !== quoteReqId) return;
      quote = null;
      if(showToastOnError) toast((err && err.message) ? err.message : 'Erro ao calcular o pedido.');

      clearEl(summaryEl);
      renderErrorState(summaryEl, {
        title: 'Erro ao calcular valores',
        message: (err && err.message) ? err.message : 'Tente novamente em instantes.',
        onRetry: () => refreshQuote({ showToastOnError:true }),
        secondaryAction: { label: 'Voltar ao carrinho', href: 'cart.html' },
      });
      setShippingMessage('');
      if(submitBtn) submitBtn.disabled = true;
    }
  }

  // Debounce para CEP
  let cepTimer = null;
  if(cepInput){
    const onCep = () => {
      if(cepTimer) window.clearTimeout(cepTimer);
      cepTimer = window.setTimeout(() => refreshQuote({}), 450);
    };
    cepInput.addEventListener('input', onCep);
    cepInput.addEventListener('blur', () => refreshQuote({}));
  }

  if(couponForm){
    couponForm.addEventListener('submit', (e) => {
      e.preventDefault();
      refreshQuote({ showToastOnError:true });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(submitErr, '');

    const val = validateForm(form);
    if(!val.ok){
      toast('Revise os campos destacados.');
      if(val.first && typeof val.first.focus === 'function') val.first.focus();
      return;
    }

    const items = buildOrderItemsFromCart();
    if(items.length === 0){
      toast('Seu carrinho est vazio.');
      return;
    }

    // garante quote atualizado
    if(!quote){
      await refreshQuote({ showToastOnError:true });
      if(!quote) return;
    }

    const selectedShipping = currentSelectedShipping();
    if(validateCep(cepInput ? cepInput.value : '') && !selectedShipping){
      setError(submitErr, 'Selecione uma opo de frete para continuar.');
      toast('Selecione uma opo de frete.');
      return;
    }

    const fd = new FormData(form);
    const recipient_name = String(fd.get('name') || '').trim();
    const phone = normalizePhone(fd.get('phone'));
    const cep = normalizeCep(fd.get('cep'));
    const street = String(fd.get('address') || '').trim();
    const number = String(fd.get('number') || '').trim();
    const neighborhood = String(fd.get('neighborhood') || '').trim();
    const city = String(fd.get('city') || '').trim();
    const state = String(fd.get('state') || '').trim();
    const complement = String(fd.get('complement') || '').trim();

    const paymentMethod = pickPaymentMethod(form) || 'pix';

    const couponCode = couponInput ? String(couponInput.value || '').trim() : readCoupon();

    const orderPayload = {
      store_slug: STORE.slug,
      items: items.map(it => ({ product_id: it.product_id, variant_id: it.variant_id, quantity: it.quantity })),
      shipping_service: selectedShipping ? String(selectedShipping.service || '') : 'PICKUP',
      shipping_price: selectedShipping ? Number(selectedShipping.price) || 0 : 0,
      shipping_eta_days: selectedShipping ? Number(selectedShipping.eta_days) || 0 : 0,
      address: {
        recipient_name,
        phone,
        cep,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
      },
      coupon_code: couponCode || null,
    };

    const token = session.getToken();

    setButtonLoading(submitBtn, true, { idleText: 'Finalizar pedido', loadingText: 'Criando pedido...' });

    try {
      const res = await createOrder(orderPayload, { token, paymentMethod });
      const orderId = res?.orderId;
      if(orderId == null){
        throw new Error('Pedido criado, mas no recebemos o nmero do pedido.');
      }

      // Salva para a pgina de confirmao
      const discounts = Array.isArray(quote?.discounts) ? quote.discounts : [];
      const summary = {
        orderId,
        created_at: new Date().toISOString(),
        currency: 'BRL',
        items: items.map(it => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
          product_name: String(it.product_name || ''),
          variant_label: String(it.variant_label || ''),
          image_url: String(it.image_url || ''),
        })),
        subtotal: Number(quote?.subtotal) || items.reduce((s,it)=>s+(Number(it.line_total)||0),0),
        shipping: selectedShipping ? {
          service: String(selectedShipping.service || ''),
          price: Number(selectedShipping.price) || 0,
          eta_days: Number(selectedShipping.eta_days) || 0,
        } : null,
        discounts: discounts.map(d => ({
          code: d?.code ? String(d.code) : null,
          label: d?.label ? String(d.label) : 'Desconto',
          amount: Number(d?.amount) || 0,
        })),
        total: (() => {
          const sub = Number(quote?.subtotal) || items.reduce((s,it)=>s+(Number(it.line_total)||0),0);
          const ship = selectedShipping ? (Number(selectedShipping.price) || 0) : 0;
          const disc = discounts.reduce((s,d)=>s+(Number(d?.amount)||0),0);
          const t = Number(quote?.total);
          return Number.isFinite(t) && t > 0 ? t : Math.max(0, sub + ship - disc);
        })(),
        paymentMethod,
        paymentInstructions: res?.paymentInstructions || null,
      };

      try { sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(summary)); } catch { /* ignore */ }

      // Limpa carrinho/estado
      clearCart();
      writeCoupon('');
      writeCheckoutState({ shipping_service: '', cep: '' });

      window.location.href = `thank-you.html?orderId=${encodeURIComponent(String(orderId))}`;
    } catch (err){
      const msg = (err && err.message) ? err.message : 'No foi possvel criar o pedido.';
      setError(submitErr, msg);
      toast(msg);
    } finally {
      setButtonLoading(submitBtn, false, { idleText: 'Finalizar pedido', loadingText: 'Criando pedido...' });
    }
  });

  // Primeira carga
  refreshQuote({});
}

// Mantm compatibilidade com o entry atual
window.initCheckout = initCheckout;

