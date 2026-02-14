import { setText } from '../../utils/sanitize.js';
import { renderErrorState, renderEmptyState } from '../../ui/states.js';
import { getOrders } from '../../core/customerApi.js';
import { session } from '../../core/session.js';

function clear(el){
  if(!el) return;
  while(el.firstChild) el.removeChild(el.firstChild);
}

function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(d);
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

function pickTotal(order){
  if(order == null) return null;
  if(order.total_cents != null) return Number(order.total_cents) / 100;
  if(order.totalCentavos != null) return Number(order.totalCentavos) / 100;
  if(order.total_amount != null) return Number(order.total_amount);
  if(order.total != null) return Number(order.total);
  if(order.amount != null) return Number(order.amount);
  return null;
}

function pickStatus(order){
  return order?.status || order?.state || order?.situacao || '';
}

function pickId(order){
  return order?.id ?? order?.orderId ?? order?._id ?? order?.number ?? '';
}

function pickCreated(order){
  return order?.created_at || order?.createdAt || order?.created || order?.date || '';
}

function pickItemsCount(order){
  const items = order?.items || order?.lines || order?.itens || [];
  if(Array.isArray(items)) return items.reduce((acc, it) => acc + (Number(it.qty ?? it.quantity ?? 1) || 0), 0);
  return 0;
}

export async function initOrdersPage(){
  const ok = await session.requireAuth({ validate: true });
  if(!ok) return;

  const root = document.querySelector('[data-orders-root]');
  const alertEl = document.querySelector('[data-alert]');
  if(!root) return;

  clear(root);
  const loading = document.createElement('div');
  loading.className = 'state';
  const h = document.createElement('h3');
  setText(h, 'Carregando pedidos...');
  const p = document.createElement('p');
  setText(p, 'Aguarde um instante.');
  loading.appendChild(h);
  loading.appendChild(p);
  root.appendChild(loading);

  try {
    const token = session.getToken();
    const data = await getOrders(token);
    const orders = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : []);

    clear(root);
    if(!orders.length){
      renderEmptyState(root, {
        title: 'Voc ainda no tem pedidos',
        message: 'Quando voc finalizar uma compra, ela aparecer aqui.',
        actionText: 'Ver produtos',
        actionHref: 'category.html',
      });
      return;
    }

    const meta = document.createElement('p');
    meta.className = 'help';
    setText(meta, `${orders.length} pedido(s) encontrado(s).`);
    root.appendChild(meta);

    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Pedido','Data','Status','Itens','Total',''].forEach((c) => {
      const th = document.createElement('th');
      setText(th, c);
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    const tbody = document.createElement('tbody');
    for(const o of orders){
      const tr = document.createElement('tr');

      const id = pickId(o);
      const status = pickStatus(o);
      const created = pickCreated(o);
      const count = pickItemsCount(o);
      const total = pickTotal(o);
      const currency = o?.currency || o?.moeda || 'BRL';

      const tdId = document.createElement('td');
      setText(tdId, String(id));

      const tdDate = document.createElement('td');
      setText(tdDate, fmtDate(created) || '');

      const tdStatus = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill';
      setText(pill, String(status));
      tdStatus.appendChild(pill);

      const tdItems = document.createElement('td');
      setText(tdItems, count ? String(count) : '');

      const tdTotal = document.createElement('td');
      setText(tdTotal, total != null ? money(total, currency) : '');

      const tdAct = document.createElement('td');
      const link = document.createElement('a');
      link.className = 'btn btn-sm';
      link.href = `order.html?id=${encodeURIComponent(String(id))}`;
      setText(link, 'Ver');
      tdAct.appendChild(link);

      tr.appendChild(tdId);
      tr.appendChild(tdDate);
      tr.appendChild(tdStatus);
      tr.appendChild(tdItems);
      tr.appendChild(tdTotal);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    root.appendChild(table);
  } catch (err){
    clear(root);
    if(alertEl){
      alertEl.style.display = 'block';
      setText(alertEl, (err && err.message) ? err.message : 'No foi possvel carregar seus pedidos.');
    }
    renderErrorState(root, {
      title: 'Erro ao carregar pedidos',
      message: 'Tente novamente em instantes.',
      actionText: 'Recarregar',
      actionHref: 'orders.html',
    });
  }
}

