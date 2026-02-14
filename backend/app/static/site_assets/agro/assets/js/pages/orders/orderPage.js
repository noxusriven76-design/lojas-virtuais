import { setText } from '../../utils/sanitize.js';
import { renderErrorState } from '../../ui/states.js';
import { getOrder } from '../../core/customerApi.js';
import { session } from '../../core/session.js';

function clear(el){
  if(!el) return;
  while(el.firstChild) el.removeChild(el.firstChild);
}

function fmtDateTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function money(val, currency='BRL'){
  const n = Number(val);
  if(!Number.isFinite(n)) return '-';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(n);
  } catch {
    return String(n);
  }
}

function pickId(order){
  return order?.id ?? order?.orderId ?? order?._id ?? order?.number ?? '';
}

function pickStatus(order){
  return order?.status || order?.state || order?.situacao || '—';
}

function pickCreated(order){
  return order?.created_at || order?.createdAt || order?.created || order?.date || '';
}

function pickItems(order){
  const items = order?.items || order?.lines || order?.itens || [];
  return Array.isArray(items) ? items : [];
}

function pickCurrency(order){
  return order?.currency || order?.moeda || 'BRL';
}

function priceFromItem(it){
  if(it == null) return null;
  if(it.unit_price_cents != null) return Number(it.unit_price_cents) / 100;
  if(it.unitPriceCents != null) return Number(it.unitPriceCents) / 100;
  if(it.unit_price != null) return Number(it.unit_price);
  if(it.unitPrice != null) return Number(it.unitPrice);
  if(it.price != null) return Number(it.price);
  if(it.valor != null) return Number(it.valor);
  return null;
}

function qtyFromItem(it){
  const q = Number(it?.qty ?? it?.quantity ?? it?.qtd ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

function nameFromItem(it){
  return it?.name || it?.title || it?.produto || it?.product_name || it?.product?.name || it?.product?.title || 'Item';
}

function slugFromItem(it){
  return it?.product_slug || it?.productSlug || it?.slug || it?.product?.slug || '';
}

function sumItems(items){
  let s = 0;
  for(const it of items){
    const p = priceFromItem(it);
    const q = qtyFromItem(it);
    if(Number.isFinite(p)) s += p * q;
  }
  return s;
}

function pickTotals(order){
  // Tenta acomodar formatos comuns.
  const total = (
    order?.total_cents != null ? Number(order.total_cents) / 100 :
    order?.totalCentavos != null ? Number(order.totalCentavos) / 100 :
    order?.total_amount != null ? Number(order.total_amount) :
    order?.total != null ? Number(order.total) :
    order?.amount != null ? Number(order.amount) :
    null
  );
  const shipping = (
    order?.shipping_cents != null ? Number(order.shipping_cents) / 100 :
    order?.shipping != null ? Number(order.shipping) :
    order?.frete != null ? Number(order.frete) :
    null
  );
  const discount = (
    order?.discount_cents != null ? Number(order.discount_cents) / 100 :
    order?.discount != null ? Number(order.discount) :
    order?.desconto != null ? Number(order.desconto) :
    null
  );
  return { total, shipping, discount };
}

function renderDefinitionList(pairs){
  const table = document.createElement('table');
  table.className = 'table';
  const tbody = document.createElement('tbody');
  for(const [k,v] of pairs){
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.style.width = '160px';
    td1.style.opacity = '0.85';
    setText(td1, k);
    const td2 = document.createElement('td');
    setText(td2, v || '—');
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

export async function initOrderPage(){
  const ok = await session.requireAuth({ validate: true });
  if(!ok) return;

  const root = document.querySelector('[data-order-root]');
  const alertEl = document.querySelector('[data-alert]');
  if(!root) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if(!id){
    clear(root);
    renderErrorState(root, {
      title: 'Pedido não encontrado',
      message: 'Faltou o identificador do pedido na URL.',
      actionText: 'Voltar para pedidos',
      actionHref: 'orders.html',
    });
    return;
  }

  clear(root);
  const loading = document.createElement('div');
  loading.className = 'state';
  const h = document.createElement('h3');
  setText(h, 'Carregando pedido...');
  const p = document.createElement('p');
  setText(p, 'Aguarde um instante.');
  loading.appendChild(h);
  loading.appendChild(p);
  root.appendChild(loading);

  try {
    const token = session.getToken();
    const data = await getOrder(token, id);
    const order = data?.order || data;

    clear(root);
    if(!order){
      renderErrorState(root, {
        title: 'Pedido não encontrado',
        message: 'Não conseguimos carregar os dados do pedido.',
        actionText: 'Voltar',
        actionHref: 'orders.html',
      });
      return;
    }

    const currency = pickCurrency(order);
    const items = pickItems(order);
    const { total, shipping, discount } = pickTotals(order);
    const computedSubtotal = sumItems(items);
    const shownSubtotal = Number.isFinite(computedSubtotal) && computedSubtotal > 0 ? computedSubtotal : null;

    const grid = document.createElement('div');
    grid.className = 'grid-2';

    const cardA = document.createElement('div');
    cardA.className = 'notice';
    const h2 = document.createElement('h2');
    setText(h2, 'Resumo');
    cardA.appendChild(h2);
    cardA.appendChild(renderDefinitionList([
      ['Pedido', String(pickId(order) || id)],
      ['Data', fmtDateTime(pickCreated(order)) || '—'],
      ['Status', String(pickStatus(order))],
    ]));

    const cardB = document.createElement('div');
    cardB.className = 'notice';
    const h2b = document.createElement('h2');
    setText(h2b, 'Totais');
    cardB.appendChild(h2b);

    const rows = [];
    if(shownSubtotal != null) rows.push(['Subtotal', money(shownSubtotal, currency)]);
    if(shipping != null) rows.push(['Frete', money(shipping, currency)]);
    if(discount != null && discount !== 0) rows.push(['Desconto', money(discount, currency)]);
    rows.push(['Total', total != null ? money(total, currency) : money(shownSubtotal ?? 0, currency)]);
    cardB.appendChild(renderDefinitionList(rows));

    grid.appendChild(cardA);
    grid.appendChild(cardB);
    root.appendChild(grid);

    const itemsTitle = document.createElement('h2');
    itemsTitle.style.marginTop = '16px';
    setText(itemsTitle, 'Itens');
    root.appendChild(itemsTitle);

    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Produto','Qtd','Preço','Subtotal',''].forEach((c) => {
      const th = document.createElement('th');
      setText(th, c);
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    const tbody = document.createElement('tbody');
    for(const it of items){
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      setText(tdName, String(nameFromItem(it)));

      const q = qtyFromItem(it);
      const pUnit = priceFromItem(it);
      const tdQty = document.createElement('td');
      setText(tdQty, String(q));

      const tdPrice = document.createElement('td');
      setText(tdPrice, Number.isFinite(pUnit) ? money(pUnit, currency) : '—');

      const tdSub = document.createElement('td');
      const sub = Number.isFinite(pUnit) ? pUnit * q : null;
      setText(tdSub, sub != null ? money(sub, currency) : '—');

      const tdAct = document.createElement('td');
      const slug = slugFromItem(it);
      if(slug){
        const a = document.createElement('a');
        a.className = 'btn btn-sm';
        a.href = `product.html?slug=${encodeURIComponent(String(slug))}`;
        setText(a, 'Ver');
        tdAct.appendChild(a);
      }

      tr.appendChild(tdName);
      tr.appendChild(tdQty);
      tr.appendChild(tdPrice);
      tr.appendChild(tdSub);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    root.appendChild(table);

    const shippingObj = order?.shipping || order?.entrega || order?.shipping_address || order?.shippingAddress;
    if(shippingObj){
      const shipTitle = document.createElement('h2');
      shipTitle.style.marginTop = '16px';
      setText(shipTitle, 'Entrega');
      root.appendChild(shipTitle);
      const card = document.createElement('div');
      card.className = 'notice';

      const parts = [];
      const name = shippingObj?.name || shippingObj?.receiver || shippingObj?.destinatario;
      const addr1 = shippingObj?.address1 || shippingObj?.address || shippingObj?.endereco;
      const addr2 = shippingObj?.address2 || shippingObj?.complement;
      const city = shippingObj?.city || shippingObj?.cidade;
      const state = shippingObj?.state || shippingObj?.uf;
      const zip = shippingObj?.zip || shippingObj?.postal_code || shippingObj?.cep;

      if(name) parts.push(String(name));
      if(addr1) parts.push(String(addr1));
      if(addr2) parts.push(String(addr2));
      const line = [city, state].filter(Boolean).join(' - ');
      if(line) parts.push(line);
      if(zip) parts.push(String(zip));

      const pShip = document.createElement('p');
      pShip.className = 'footer-small';
      setText(pShip, parts.join(' • '));
      card.appendChild(pShip);
      root.appendChild(card);
    }
  } catch (err){
    clear(root);
    if(alertEl){
      alertEl.style.display = 'block';
      setText(alertEl, (err && err.message) ? err.message : 'Não foi possível carregar o pedido.');
    }
    renderErrorState(root, {
      title: 'Erro ao carregar pedido',
      message: 'Tente novamente ou volte para a lista de pedidos.',
      actionText: 'Voltar para pedidos',
      actionHref: 'orders.html',
    });
  }
}
