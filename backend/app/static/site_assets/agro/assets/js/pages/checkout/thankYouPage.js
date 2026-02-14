import { setText } from '../../utils/sanitize.js';
import { renderErrorState, renderEmptyState } from '../../ui/states.js';
import { STORE, formatBRL } from '../../products.js';
import { setCanonical } from '../../main.js';
import { session } from '../../core/session.js';
import { getOrder } from '../../core/customerApi.js';

const LAST_ORDER_KEY = 'lv_last_order_v1';

function clear(el){
  if(!el) return;
  while(el.firstChild) el.removeChild(el.firstChild);
}

function qs(name){
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function readLastOrder(){
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : null;
  } catch {
    return null;
  }
}

function pickId(o){
  return o?.orderId ?? o?.id ?? o?.order_id ?? o?.number ?? '';
}

function pickCreated(o){
  return o?.created_at || o?.createdAt || o?.created || '';
}

function money(n){
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function normalizeItems(items){
  const list = Array.isArray(items) ? items : [];
  return list.map((it) => {
    const qty = Number(it?.quantity ?? it?.qty ?? 1) || 1;
    return {
      product_name: String(it?.product_name ?? it?.name ?? ''),
      variant_label: String(it?.variant_label ?? it?.variantLabel ?? ''),
      quantity: Math.max(1, qty),
      unit_price: money(it?.unit_price ?? it?.unitPrice ?? it?.unit_price_amount ?? it?.unitPriceAmount),
      line_total: money(it?.line_total ?? it?.lineTotal ?? (money(it?.unit_price ?? it?.unitPrice) * qty)),
      image_url: String(it?.image_url ?? it?.imageUrl ?? ''),
    };
  });
}

function normalizeSummary(raw){
  if(!raw || typeof raw !== 'object') return null;

  const id = pickId(raw);
  const created_at = pickCreated(raw);

  // Stored summary (checkout.js)
  if(raw.items && raw.subtotal != null && raw.total != null){
    return {
      orderId: id,
      created_at: created_at,
      currency: raw.currency || 'BRL',
      items: normalizeItems(raw.items),
      subtotal: money(raw.subtotal),
      shipping: raw.shipping ? {
        service: String(raw.shipping.service || raw.shipping_service || ''),
        price: money(raw.shipping.price ?? raw.shipping_price),
        eta_days: Number(raw.shipping.eta_days ?? raw.shipping_eta_days) || 0,
      } : {
        service: String(raw.shipping_service || ''),
        price: money(raw.shipping_price),
        eta_days: Number(raw.shipping_eta_days) || 0,
      },
      discounts: Array.isArray(raw.discounts) ? raw.discounts.map(d => ({
        label: String(d?.label || 'Desconto'),
        code: d?.code ? String(d.code) : null,
        amount: money(d?.amount),
      })) : [],
      discount_total: money(raw.discount_total ?? raw.discount),
      total: money(raw.total),
      paymentInstructions: raw.paymentInstructions || raw.payment_instructions || null,
    };
  }

  // API order (backend /orders/{id})
  const items = normalizeItems(raw.items || raw.lines || raw.itens);
  const subtotal = money(raw.subtotal ?? raw.subtotal_amount ?? raw.subtotal_cents ? money(raw.subtotal_cents)/100 : null);
  const shipping_price = money(raw.shipping_price ?? raw.shippingPrice ?? raw.shipping_cents ? money(raw.shipping_cents)/100 : null);
  const discount = money(raw.discount ?? raw.discount_amount ?? raw.discount_cents ? money(raw.discount_cents)/100 : null);
  const total = money(raw.total ?? raw.total_amount ?? raw.total_cents ? money(raw.total_cents)/100 : null);

  const shipping = {
    service: String(raw.shipping_service || raw.shippingService || ''),
    price: shipping_price,
    eta_days: Number(raw.shipping_eta_days || raw.shippingEtaDays || 0) || 0,
  };

  const discounts = [];
  if(discount > 0) discounts.push({ label: 'Desconto', code: null, amount: discount });

  return {
    orderId: id,
    created_at,
    currency: raw.currency || 'BRL',
    items,
    subtotal,
    shipping,
    discounts,
    discount_total: discount,
    total,
    paymentInstructions: raw.payment_instructions || raw.paymentInstructions || null,
  };
}

function renderSummary(container, summary){
  clear(container);

  const h = document.createElement('h2');
  h.style.margin = '0 0 6px';
  h.style.fontSize = '18px';
  setText(h, 'Pedido confirmado');
  container.appendChild(h);

  const p = document.createElement('p');
  p.className = 'help';
  const id = summary?.orderId ? String(summary.orderId) : '';
  setText(p, id ? `Número do pedido: ${id}` : 'Seu pedido foi criado.');
  container.appendChild(p);

  const items = Array.isArray(summary?.items) ? summary.items : [];

  if(items.length){
    const table = document.createElement('table');
    table.className = 'table';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Item','Qtd','Preço','Total'].forEach((c) => {
      const th = document.createElement('th');
      setText(th, c);
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    const tbody = document.createElement('tbody');
    for(const it of items){
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      const name = String(it.product_name || '').trim() || 'Produto';
      const v = String(it.variant_label || '').trim();
      setText(tdName, v ? `${name} — ${v}` : name);

      const tdQty = document.createElement('td');
      setText(tdQty, String(it.quantity || 1));

      const tdUnit = document.createElement('td');
      setText(tdUnit, formatBRL(money(it.unit_price)));

      const tdLine = document.createElement('td');
      setText(tdLine, formatBRL(money(it.line_total)));

      tr.appendChild(tdName);
      tr.appendChild(tdQty);
      tr.appendChild(tdUnit);
      tr.appendChild(tdLine);
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
  }

  const totals = document.createElement('div');
  totals.className = 'summary';
  totals.style.marginTop = '14px';

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

  const subtotal = money(summary?.subtotal);
  totals.appendChild(row('Subtotal', formatBRL(subtotal)));

  if(summary?.shipping && (summary.shipping.service || summary.shipping.price)){
    const eta = Number(summary.shipping.eta_days) || 0;
    const etaTxt = eta ? ` (${eta} dia(s))` : '';
    totals.appendChild(row(`Frete — ${String(summary.shipping.service || '')}${etaTxt}`, formatBRL(money(summary.shipping.price))));
  }

  const discounts = Array.isArray(summary?.discounts) ? summary.discounts : [];
  for(const d of discounts){
    const amount = money(d?.amount);
    if(amount <= 0) continue;
    const code = d?.code ? ` (${String(d.code)})` : '';
    const label = String(d?.label || 'Desconto');
    totals.appendChild(row(`${label}${code}`, `- ${formatBRL(amount)}`));
  }

  const hr = document.createElement('hr');
  hr.className = 'sep';
  totals.appendChild(hr);
  totals.appendChild(row('Total', formatBRL(money(summary?.total)), { strong:true }));

  container.appendChild(totals);

  const instr = summary?.paymentInstructions ? String(summary.paymentInstructions) : '';
  if(instr){
    const box = document.createElement('div');
    box.className = 'notice';
    box.style.marginTop = '14px';

    const th = document.createElement('h3');
    th.style.margin = '0 0 6px';
    th.style.fontSize = '14px';
    setText(th, 'Instruções de pagamento');

    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.margin = '0';
    pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    pre.style.fontSize = '12px';
    setText(pre, instr);

    box.appendChild(th);
    box.appendChild(pre);
    container.appendChild(box);
  }
}

function renderActions(container, summary){
  clear(container);
  const id = summary?.orderId ? String(summary.orderId) : '';

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.gap = '10px';
  wrap.style.flexWrap = 'wrap';

  if(id){
    const a = document.createElement('a');
    a.className = 'btn btn-primary';
    a.href = `order.html?id=${encodeURIComponent(id)}`;
    setText(a, 'Ver detalhes do pedido');
    wrap.appendChild(a);
  }

  const b = document.createElement('a');
  b.className = 'btn';
  b.href = 'orders.html';
  setText(b, 'Meus pedidos');
  wrap.appendChild(b);

  const c = document.createElement('a');
  c.className = 'btn btn-ghost';
  c.href = 'category.html';
  setText(c, 'Continuar comprando');
  wrap.appendChild(c);

  container.appendChild(wrap);
}

export async function initThankYouPage(){
  setCanonical(`${STORE.url}/thank-you.html`);

  const root = document.querySelector('[data-thankyou-root]');
  const actions = document.querySelector('[data-thankyou-actions]');
  const alertEl = document.querySelector('[data-alert]');

  if(!root) return;

  clear(root);
  const loading = document.createElement('div');
  loading.className = 'state';
  const h = document.createElement('h3');
  setText(h, 'Carregando confirmação...');
  const p = document.createElement('p');
  setText(p, 'Aguarde um instante.');
  loading.appendChild(h);
  loading.appendChild(p);
  root.appendChild(loading);

  const orderId = qs('orderId');

  try {
    // Preferência: sessionStorage (fluxo logo após checkout)
    const cached = normalizeSummary(readLastOrder());
    if(cached && (!orderId || String(cached.orderId) === String(orderId))){
      clear(root);
      renderSummary(root, cached);
      if(actions) renderActions(actions, cached);
      return;
    }

    // Fallback: buscar no backend (requer login)
    if(orderId){
      const ok = await session.requireAuth({ validate: true });
      if(!ok) return;
      const token = session.getToken();
      const data = await getOrder(token, orderId);
      const summary = normalizeSummary(data?.order || data);

      if(!summary){
        throw new Error('Não foi possível carregar o pedido.');
      }

      clear(root);
      renderSummary(root, summary);
      if(actions) renderActions(actions, summary);
      return;
    }

    clear(root);
    renderEmptyState(root, {
      title: 'Pedido não encontrado',
      message: 'Não identificamos um pedido para exibir nesta página.',
      primaryAction: { label: 'Ir para meus pedidos', href: 'orders.html' },
      secondaryAction: { label: 'Voltar ao catálogo', href: 'category.html' },
    });
  } catch (err){
    const msg = (err && err.message) ? err.message : 'Erro ao carregar confirmação.';
    if(alertEl){
      alertEl.style.display = 'block';
      setText(alertEl, msg);
    }

    clear(root);
    renderErrorState(root, {
      title: 'Erro ao carregar confirmação',
      message: msg,
      onRetry: () => window.location.reload(),
      secondaryAction: { label: 'Ir para home', href: 'index.html' },
    });
  }
}
