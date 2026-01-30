async function renderCart(){
  if(typeof ensureCatalogLoaded === 'function'){
    try{ await ensureCatalogLoaded(); } catch(_){ /* fallback */ }
  }
  const listWrap = document.querySelector('[data-cart-list]');
  const emptyWrap = document.querySelector('[data-cart-empty]');
  const totals = cartTotals();

  if(listWrap){
    listWrap.innerHTML = '';
    if(totals.items.length === 0){
      if(emptyWrap) emptyWrap.style.display = 'block';
      return;
    }
    if(emptyWrap) emptyWrap.style.display = 'none';

    totals.items.forEach(it => {
      const el = document.createElement('div');
      el.className = 'cart-item';
      const img = it.product.image_url;
      const v = it.variant;
      const details = v ? `${v.color} • ${v.size} • SKU ${v.sku}` : 'Variação padrão';
      el.innerHTML = `
        <img src="${img}" alt="${it.product.name} em foto ilustrativa" loading="lazy" width="300" height="400">
        <div>
          <h3><a href="${getProductUrl(it.product)}">${it.product.name}</a></h3>
          <p>${details}</p>
          <div class="qty">
            <label class="label" for="qty-${it.productSlug}-${it.variantSku}">Qtd.</label>
            <input class="input" id="qty-${it.productSlug}-${it.variantSku}" type="number" min="1" max="99" value="${it.qty}" aria-label="Quantidade">
            <button class="btn btn-sm" data-remove="${it.productSlug}|${it.variantSku}">Remover</button>
            <div style="margin-left:auto; font-weight:700;">${formatBRL(it.lineTotal)}</div>
          </div>
        </div>
      `;
      listWrap.appendChild(el);

      const qtyInput = el.querySelector('input');
      qtyInput.addEventListener('change', () => {
        updateCartQty(it.productSlug, it.variantSku, qtyInput.value);
        renderCart();
      });

      el.querySelector('[data-remove]')?.addEventListener('click', () => {
        removeFromCart(it.productSlug, it.variantSku);
        renderCart();
      });
    });
  }

  // resumo
  setText('[data-subtotal]', formatBRL(totals.subtotal));
  const shipping = totals.subtotal > 299 ? 0 : 19.90;
  setText('[data-shipping]', formatBRL(shipping));
  setText('[data-total]', formatBRL(totals.subtotal + shipping));

  // cupom (UI)
  const couponBtn = document.querySelector('[data-apply-coupon]');
  couponBtn?.addEventListener('click', () => {
    toast('Cupom aplicado (placeholder). Integre com o backend para validar.');
  });

  // CTA
  const checkoutBtn = document.querySelector('[data-go-checkout]');
  checkoutBtn?.addEventListener('click', () => {
    if(totals.items.length === 0){ toast('Seu carrinho está vazio.'); return; }
    window.location.href = 'checkout.html';
  });

  // Canonical deve refletir a página real existente (HTML estático)
  setCanonical(`${STORE.url}/cart.html`);
}

document.addEventListener('DOMContentLoaded', () => { renderCart(); });
