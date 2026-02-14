import { setText } from '../../utils/sanitize.js';
import { renderErrorState, renderEmptyState } from '../../ui/states.js';
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

export async function initAccountPage(){
  const ok = await session.requireAuth({ validate: true });
  if(!ok) return;

  const root = document.querySelector('[data-account-root]');
  const alertEl = document.querySelector('[data-alert]');
  if(!root) return;

  clear(root);
  const loading = document.createElement('div');
  loading.className = 'state';
  const title = document.createElement('h3');
  setText(title, 'Carregando sua conta...');
  loading.appendChild(title);
  root.appendChild(loading);

  try {
    const user = session.getUser();
    if(!user){
      // Token existe, mas usuário não carregou por algum motivo.
      await session.refreshUser({ force: true });
    }
    const u = session.getUser();
    clear(root);
    if(!u){
      renderEmptyState(root, {
        title: 'Não encontramos seus dados',
        message: 'Faça login novamente para continuar.',
        actionText: 'Entrar',
        actionHref: session.buildLoginHref({ returnTo: 'account.html' }),
      });
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'grid-2';

    const cardA = document.createElement('div');
    cardA.className = 'notice';
    const h2 = document.createElement('h2');
    setText(h2, 'Seus dados');
    const p = document.createElement('p');
    p.className = 'footer-small';
    setText(p, 'Informações básicas da sua conta.');
    const table = document.createElement('table');
    table.className = 'table';
    const tbody = document.createElement('tbody');

    const addRow = (label, value) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.style.width = '140px';
      td1.style.opacity = '0.85';
      setText(td1, label);
      const td2 = document.createElement('td');
      setText(td2, value || '-');
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbody.appendChild(tr);
    };

    addRow('Nome', u.name || u.full_name || u.nome || '');
    addRow('E-mail', u.email || '');
    addRow('ID', String(u.id ?? u.userId ?? u._id ?? ''));
    addRow('Criado em', fmtDate(u.created_at || u.createdAt || u.created));

    table.appendChild(tbody);
    cardA.appendChild(h2);
    cardA.appendChild(p);
    cardA.appendChild(table);

    const cardB = document.createElement('div');
    cardB.className = 'notice';
    const h2b = document.createElement('h2');
    setText(h2b, 'Ações');
    const pb = document.createElement('p');
    pb.className = 'footer-small';
    setText(pb, 'Acesse seus pedidos ou finalize sua sessão.');

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.flexWrap = 'wrap';
    actions.style.marginTop = '12px';

    const orders = document.createElement('a');
    orders.className = 'btn btn-primary';
    orders.href = 'orders.html';
    setText(orders, 'Meus pedidos');

    const support = document.createElement('a');
    support.className = 'btn';
    support.href = 'support.html';
    setText(support, 'Suporte');

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'btn btn-ghost';
    setText(logout, 'Sair');
    logout.addEventListener('click', () => {
      session.logout();
      window.location.replace('index.html');
    });

    actions.appendChild(orders);
    actions.appendChild(support);
    actions.appendChild(logout);

    cardB.appendChild(h2b);
    cardB.appendChild(pb);
    cardB.appendChild(actions);

    grid.appendChild(cardA);
    grid.appendChild(cardB);
    root.appendChild(grid);
  } catch (err){
    clear(root);
    if(alertEl){
      alertEl.style.display = 'block';
      setText(alertEl, (err && err.message) ? err.message : 'Não foi possível carregar sua conta.');
    }
    renderErrorState(root, {
      title: 'Erro ao carregar sua conta',
      message: 'Tente novamente ou faça login de novo.',
      actionText: 'Entrar',
      actionHref: session.buildLoginHref({ returnTo: 'account.html' }),
    });
  }
}
