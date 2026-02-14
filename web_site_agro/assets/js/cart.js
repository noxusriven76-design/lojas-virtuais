import { setText, safeUrl } from './utils/sanitize.js';
import { cartLineItems, removeFromCart, updateCartQty, cartTotals, toast, setCanonical } from './main.js';
import { STORE, formatBRL, ensureCatalogLoaded } from './products.js';
import { renderEmptyState } from './ui/states.js';

const COUPON_KEY = 'lv_coupon_v1';

function clear(el){
  if(!el) return;
  while(el.firstChild) el.removeChild(el.firstChild);
}

function readCoupon(){
  return String(localStorage.getItem(COUPON_KEY) || '').trim();
}

function writeCoupon(code){
  const v = String(code || '').trim();
  if(!v) localStorage.removeItem(COUPON_KEY);
  else localStorage.setItem(COUPON_KEY, v);
}

function renderCartItem(item){
  const productName = String(item?.product?.name || item?.productSlug || 'Produto');
  const variantText = item?.variant
    ? `${String(item.variant.color || 'Padrão')} - ${String(item.variant.size || 'Único')}`
    : 'Variação padrão';
  const imageUrl = String(item?.product?.image_url || item?.product?.images?.[0] || '');

  const row = document.createElement('div');
  row.className = 'cart-item';

  const img = document.createElement('img');
  img.src = safeUrl(imageUrl) || 'assets/img/placeholder.svg';
  img.alt = productName;
  img.width = 84;
  img.height = 110;
  img.loading = 'lazy';

  const body = document.createElement('div');

  const h3 = document.createElement('h3');
  setText(h3, productName);

  const meta = document.createElement('p');
  setText(meta, variantText);

  const price = document.createElement('p');
  setText(price, formatBRL(item.price));

  const qty = document.createElement('div');
  qty.className = 'qty';

  const qlabel = document.createElement('span');
  qlabel.className = 'label';
  setText(qlabel, 'Qtd');

  const qtyControl = document.createElement('div');
  qtyControl.className = 'cart-qty-control';

  const dec = document.createElement('button');
  dec.type = 'button';
  dec.className = 'cart-qty-btn';
  dec.setAttribute('aria-label', `Diminuir quantidade de ${productName}`);
  dec.textContent = '-';

  const input = document.createElement('input');
  input.className = 'input cart-qty-input';
  input.type = 'number';
  input.min = '1';
  input.max = '99';
  input.value = String(item.qty);
  input.setAttribute('aria-label', `Quantidade de ${productName}`);
  input.setAttribute('inputmode', 'numeric');

  const inc = document.createElement('button');
  inc.type = 'button';
  inc.className = 'cart-qty-btn';
  inc.setAttribute('aria-label', `Aumentar quantidade de ${productName}`);
  inc.textContent = '+';

  const applyQty = (rawValue) => {
    const v = Math.max(1, Math.min(99, parseInt(String(rawValue), 10) || 1));
    input.value = String(v);
    updateCartQty(item.productSlug, item.variantSku, v);
    toast('Quantidade atualizada.');
    renderCart();
  };

  input.addEventListener('change', (e) => {
    applyQty(e.target.value);
  });
  input.addEventListener('blur', (e) => applyQty(e.target.value));
  dec.addEventListener('click', () => applyQty(Number(input.value || 1) - 1));
  inc.addEventListener('click', () => applyQty(Number(input.value || 1) + 1));

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-sm';
  removeBtn.type = 'button';
  setText(removeBtn, 'Remover');
  removeBtn.addEventListener('click', () => {
    removeFromCart(item.productSlug, item.variantSku);
    toast('Item removido do carrinho.');
    renderCart();
  });

  qtyControl.appendChild(dec);
  qtyControl.appendChild(input);
  qtyControl.appendChild(inc);

  qty.appendChild(qlabel);
  qty.appendChild(qtyControl);
  qty.appendChild(removeBtn);

  body.appendChild(h3);
  body.appendChild(meta);
  body.appendChild(price);
  body.appendChild(qty);

  row.appendChild(img);
  row.appendChild(body);
  return row;
}

function setCheckoutEnabled(btn, enabled){
  if(!btn) return;
  btn.disabled = !enabled;
  if(enabled) btn.removeAttribute('aria-disabled');
  else btn.setAttribute('aria-disabled', 'true');
}

function renderCart(){
  const listWrap = document.querySelector('[data-cart-list]');
  const emptyWrap = document.querySelector('[data-cart-empty]');
  const subtotalEl = document.querySelector('[data-subtotal]');
  const shippingEl = document.querySelector('[data-shipping]');
  const totalEl = document.querySelector('[data-total]');
  const checkoutBtn = document.querySelector('[data-go-checkout]');

  if(!listWrap) return;

  const items = cartLineItems();
  clear(listWrap);

  if(items.length === 0){
    if(emptyWrap){
      emptyWrap.style.display = 'block';
      // Mantém o HTML original (notice) e insere um state dentro, para feedback mais claro.
      if(emptyWrap.querySelector('.state') == null){
        renderEmptyState(emptyWrap, {
          title: 'Seu carrinho está vazio',
          message: 'Adicione produtos para continuar.',
          primaryAction: { label: 'Ver vitrine', href: 'index.html' },
          secondaryAction: { label: 'Ver categorias', href: 'category.html' },
        });
      }
    }
    if(subtotalEl) setText(subtotalEl, formatBRL(0));
    if(shippingEl) setText(shippingEl, formatBRL(0));
    if(totalEl) setText(totalEl, formatBRL(0));
    setCheckoutEnabled(checkoutBtn, false);
    return;
  }

  if(emptyWrap){
    emptyWrap.style.display = 'none';
    // limpa state inserido previamente, mantendo a notice original escondida
    const st = emptyWrap.querySelector('.state');
    if(st) st.remove();
  }

  items.forEach((item) => listWrap.appendChild(renderCartItem(item)));

  // Totais
  const totals = cartTotals();
  const subtotal = Number(totals.subtotal) || 0;
  // Placeholder: mantém regra simples aqui; o checkout recalcula usando quote.
  const shipping = subtotal > 299 ? 0 : 19.90;
  const total = subtotal + shipping;

  if(subtotalEl) setText(subtotalEl, formatBRL(subtotal));
  if(shippingEl) setText(shippingEl, formatBRL(shipping));
  if(totalEl) setText(totalEl, formatBRL(total));

  setCheckoutEnabled(checkoutBtn, true);
}

export async function initCart(){
  setCanonical(`${STORE.url}/cart.html`);

  const checkoutBtn = document.querySelector('[data-go-checkout]');
  if(checkoutBtn){
    checkoutBtn.addEventListener('click', () => {
      const items = cartLineItems();
      if(items.length === 0){
        toast('Seu carrinho está vazio.');
        return;
      }
      window.location.href = 'checkout.html';
    });
  }

  const couponInput = document.getElementById('cupom');
  const applyCouponBtn = document.querySelector('[data-apply-coupon]');
  if(couponInput){
    const saved = readCoupon();
    if(saved) couponInput.value = saved;
  }
  if(applyCouponBtn && couponInput){
    applyCouponBtn.addEventListener('click', () => {
      const code = String(couponInput.value || '').trim();
      if(!code){
        writeCoupon('');
        toast('Cupom removido.');
        renderCart();
        return;
      }
      writeCoupon(code);
      // O carrinho não valida cupom aqui (depende do backend/quote). Guardamos para o checkout.
      toast('Cupom salvo. Ele será aplicado no checkout.');
    });
  }

  try { await ensureCatalogLoaded(); } catch { /* fallback silencioso */ }
  renderCart();
}

window.initCart = initCart;
