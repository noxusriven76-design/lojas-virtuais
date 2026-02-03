import { setText, safeUrl } from './utils/sanitize.js';
import { cartLineItems, removeFromCart, updateCartQty, cartTotals, toast, setCanonical } from './main.js';
import { STORE, formatBRL } from './products.js';
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
  const row = document.createElement('div');
  row.className = 'cart-item';

  const img = document.createElement('img');
  img.src = safeUrl(item.image) || 'assets/img/placeholder.svg';
  img.alt = item.name;
  img.width = 84;
  img.height = 110;
  img.loading = 'lazy';

  const body = document.createElement('div');

  const h3 = document.createElement('h3');
  setText(h3, item.name);

  const meta = document.createElement('p');
  setText(meta, item.variant);

  const price = document.createElement('p');
  setText(price, formatBRL(item.price));

  const qty = document.createElement('div');
  qty.className = 'qty';

  const qlabel = document.createElement('label');
  qlabel.className = 'label';
  setText(qlabel, 'Qtd');

  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'number';
  input.min = '1';
  input.max = '99';
  input.value = String(item.qty);
  input.setAttribute('aria-label', `Quantidade de ${item.name}`);

  input.addEventListener('change', (e) => {
    const v = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
    e.target.value = String(v);
    updateCartQty(item.key, v);
    toast('Quantidade atualizada.');
    renderCart();
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-sm';
  removeBtn.type = 'button';
  setText(removeBtn, 'Remover');
  removeBtn.addEventListener('click', () => {
    removeFromCart(item.key);
    toast('Item removido do carrinho.');
    renderCart();
  });

  qty.appendChild(qlabel);
  qty.appendChild(input);
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

export export function initCart(){
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

  renderCart();
}

window.initCart = initCart;
