import { STORE, ensureCatalogLoaded, getActiveProducts } from './products.js';
import { renderProductCard, bindQuickAdd, setCanonical } from './main.js';

async function renderHome(){
  try { await ensureCatalogLoaded(); } catch { /* fallback */ }
  const all = getActiveProducts();

  // No backend atual não há "collections". Mantemos o layout usando regras simples.
  const byNew = [...all].sort((a,b) => (b.id||0) - (a.id||0));
  const novidades = all.filter(p => p.collections && p.collections.novidades);
  const maisVendidos = all.filter(p => p.collections && p.collections.mais_vendidos);
  const promocoes = all.filter(p => p.collections && p.collections.promocoes);

  const n = novidades.length ? novidades : byNew;
  const m = maisVendidos.length ? maisVendidos : byNew;
  const pr = promocoes.length ? promocoes : byNew;

  const map = [
    {sel: '[data-grid-novidades]', list: n},
    {sel: '[data-grid-mais]', list: m},
    {sel: '[data-grid-promo]', list: pr},
  ];

  map.forEach(({sel, list}) => {
    const grid = document.querySelector(sel);
    if(!grid) return;
    grid.innerHTML = '';
    list.slice(0,8).forEach(p => grid.appendChild(renderProductCard(p)));
  });

  bindQuickAdd();

  // canonical dinâmico (local) — em produção, trocar para domínio real
  setCanonical(`${STORE.url}/`);
}

document.addEventListener('DOMContentLoaded', () => { renderHome(); });
