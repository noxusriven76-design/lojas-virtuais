import { safeUrl, setText } from './utils/sanitize.js';
import { renderSkeletonGrid, renderErrorState, renderEmptyState, createErrorState } from './ui/states.js';
import {
  STORE,
  ensureCatalogLoaded,
  getActiveProducts,
  getCategoryBySlug,
  getPrimaryPrice,
  clamp,
} from './products.js';
import { renderProductCard, bindQuickAdd, setCanonical } from './main.js';

let _catalogReady = false;
let _renderSeq = 0;

function _paintNextFrame(){
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

function _clearAllFilters(){
  const color = document.querySelector('[data-filter-color]');
  const size = document.querySelector('[data-filter-size]');
  const min = document.querySelector('[data-filter-min]');
  const max = document.querySelector('[data-filter-max]');
  if(color) color.value='';
  if(size) size.value='';
  if(min) min.value='';
  if(max) max.value='';
  document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed','false'));
  const u = new URL(window.location.href);
  u.searchParams.set('page','1');
  history.replaceState({}, '', u.toString());
}

function getParams(){
  const u = new URL(window.location.href);
  return {
    cat: u.searchParams.get('cat') || '',
    q: (u.searchParams.get('q') || '').trim(),
    page: Number(u.searchParams.get('page') || '1')
  };
}

function applyFilters(list, state){
  let out = [...list];
  if(state.q){
    const q = state.q.toLowerCase();
    out = out.filter(p => (p.name + ' ' + p.description).toLowerCase().includes(q));
  }
  if(state.cat && state.cat !== 'novidades' && state.cat !== 'promocoes'){
    const catObj = getCategoryBySlug(state.cat);
    if(catObj) out = out.filter(p => p.category_id === catObj.id);
  }
  if(state.cat === 'novidades'){
    const hasFlags = out.some(p => p.collections && p.collections.novidades);
    if(hasFlags) out = out.filter(p => p.collections?.novidades);
    // sem flags: mantém lista e ordenação "new" dá prioridade ao mais recente.
  }
  if(state.cat === 'promocoes'){
    const hasFlags = out.some(p => p.collections && p.collections.promocoes);
    const hasSale = out.some(p => p.sale_price && p.sale_price < p.base_price);
    if(hasFlags) out = out.filter(p => p.collections?.promocoes);
    else if(hasSale) out = out.filter(p => p.sale_price && p.sale_price < p.base_price);
  }

  // cor
  if(state.color){
    out = out.filter(p => p.variants.some(v => v.active && v.color === state.color));
  }
  // tamanho
  if(state.size){
    out = out.filter(p => p.variants.some(v => v.active && v.size === state.size));
  }

  // preço
  const min = Number(state.minPrice || 0);
  const max = Number(state.maxPrice || 999999);
  out = out.filter(p => {
    const price = getPrimaryPrice(p);
    return price >= min && price <= max;
  });

  // ordenação
  switch(state.sort){
    case 'price-asc': out.sort((a,b) => getPrimaryPrice(a) - getPrimaryPrice(b)); break;
    case 'price-desc': out.sort((a,b) => getPrimaryPrice(b) - getPrimaryPrice(a)); break;
    case 'new':
      // mock: id maior = mais novo
      out.sort((a,b) => b.id - a.id);
      break;
    default: break;
  }

  return out;
}

function updateBreadcrumbs(state){
  const bc = document.querySelector('[data-breadcrumbs]');
  if(!bc) return;

  const parts = [{label:'Início', href:'index.html'}];
  if(state.cat){
    const catName = getCategoryBySlug(state.cat)?.name || (state.cat === 'novidades' ? 'Novidades' : state.cat === 'promocoes' ? 'Promoções' : 'Categoria');
    parts.push({label: catName, href: `category.html?cat=${encodeURIComponent(state.cat)}`});
  }else if(state.q){
    parts.push({label: `Busca: “${state.q}”`, href: `category.html?q=${encodeURIComponent(state.q)}`});
  }else{
    parts.push({label:'Catálogo', href:'category.html'});
  }

  bc.innerHTML = '';
  parts.forEach((p, i) => {
    const isLast = i === parts.length - 1;
    if(!isLast){
      const a = document.createElement('a');
      a.href = safeUrl(p.href) || 'index.html';
      setText(a, p.label);
      bc.appendChild(a);
      const sep = document.createElement('span');
      sep.setAttribute('aria-hidden','true');
      sep.textContent = ' / ';
      bc.appendChild(sep);
    } else {
      const span = document.createElement('span');
      span.setAttribute('aria-current','page');
      setText(span, p.label);
      bc.appendChild(span);
    }
  });

  // JSON-LD (BreadcrumbList + CollectionPage)
  const jsonEl = document.getElementById('jsonld-category');
  if(jsonEl){
    const itemList = parts.map((p, idx) => ({
      "@type": "ListItem",
      position: idx+1,
      name: p.label,
      item: `${STORE.url}/${p.href.replace('index.html','')}`
    }));

    const pageName = parts[parts.length-1].label;

    const data = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: itemList
      },
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: pageName,
        description: "Explore roupas e acessórios com estética minimalista, com foco em caimento e qualidade.",
        url: `${STORE.url}/category.html`
      }
    ];

    jsonEl.textContent = JSON.stringify(data, null, 2);
  }
}

function renderFiltersOptions(list){
  const colors = new Set();
  const sizes = new Set();
  list.forEach(p => {
    p.variants.forEach(v => { if(v.active){ colors.add(v.color); sizes.add(v.size); } });
  });

  const colorWrap = document.querySelector('[data-filter-colors]');
  const sizeWrap = document.querySelector('[data-filter-sizes]');
  if(colorWrap){
    colorWrap.innerHTML = '';
    [...colors].sort().forEach(c => {
      const b = document.createElement('button');
      b.type='button';
      b.className='chip';
      b.setAttribute('aria-pressed','false');
      b.textContent = c;
      b.addEventListener('click', () => {
        const pressed = b.getAttribute('aria-pressed') === 'true';
        colorWrap.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed','false'));
        b.setAttribute('aria-pressed', pressed ? 'false' : 'true');
        document.querySelector('[data-filter-color]').value = pressed ? '' : c;
        renderCategory();
      });
      colorWrap.appendChild(b);
    });
  }

  if(sizeWrap){
    sizeWrap.innerHTML = '';
    [...sizes].sort((a,b) => String(a).localeCompare(String(b), 'pt-BR', {numeric:true})).forEach(s => {
      const b = document.createElement('button');
      b.type='button';
      b.className='chip';
      b.setAttribute('aria-pressed','false');
      b.textContent = s;
      b.addEventListener('click', () => {
        const pressed = b.getAttribute('aria-pressed') === 'true';
        sizeWrap.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed','false'));
        b.setAttribute('aria-pressed', pressed ? 'false' : 'true');
        document.querySelector('[data-filter-size]').value = pressed ? '' : s;
        renderCategory();
      });
      sizeWrap.appendChild(b);
    });
  }
}

function stateFromUI(params){
  return {
    cat: params.cat,
    q: params.q,
    page: clamp(params.page || 1, 1, 999),
    sort: document.querySelector('[data-sort]')?.value || 'relevance',
    color: document.querySelector('[data-filter-color]')?.value || '',
    size: document.querySelector('[data-filter-size]')?.value || '',
    minPrice: document.querySelector('[data-filter-min]')?.value || '',
    maxPrice: document.querySelector('[data-filter-max]')?.value || ''
  };
}

function renderPagination(total, page, perPage, baseParams){
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const wrap = document.querySelector('[data-pagination]');
  if(!wrap) return;
  wrap.innerHTML='';
  if(totalPages <= 1) return;

  function link(p, label){
    const a = document.createElement('a');
    a.className='btn btn-sm';
    const u = new URL(window.location.href);
    u.searchParams.set('page', String(p));
    if(baseParams.cat) u.searchParams.set('cat', baseParams.cat);
    if(baseParams.q) u.searchParams.set('q', baseParams.q);
    a.href = u.pathname.replace(/.*\//,'') + u.search;
    a.textContent = label;
    a.setAttribute('aria-label', `Ir para página ${p}`);
    return a;
  }

  const prev = document.createElement('a');
  prev.className='btn btn-sm';
  prev.textContent='Anterior';
  prev.href = link(Math.max(1, page-1), 'Anterior').href;
  prev.setAttribute('aria-disabled', page===1 ? 'true':'false');
  if(page===1) prev.style.pointerEvents='none';

  const next = document.createElement('a');
  next.className='btn btn-sm';
  next.textContent='Próxima';
  next.href = link(Math.min(totalPages, page+1), 'Próxima').href;
  next.setAttribute('aria-disabled', page===totalPages ? 'true':'false');
  if(page===totalPages) next.style.pointerEvents='none';

  wrap.appendChild(prev);

  const windowSize = 5;
  const start = clamp(page - Math.floor(windowSize/2), 1, Math.max(1, totalPages-windowSize+1));
  const end = Math.min(totalPages, start + windowSize - 1);
  for(let p = start; p <= end; p++){
    const a = link(p, String(p));
    if(p === page){
      a.setAttribute('aria-current','page');
      a.style.background = 'rgba(0,0,0,.04)';
    }
    wrap.appendChild(a);
  }

  wrap.appendChild(next);
}

async function renderCategory(){
  const seq = ++_renderSeq;
  const grid = document.querySelector('[data-grid-category]');
  const pagination = document.querySelector('[data-pagination]');

  // Loading state (só na primeira carga real do catálogo)
  if(grid && !_catalogReady){
    grid.setAttribute('aria-busy','true');
    renderSkeletonGrid(grid, { count: 12 });
  }
  if(pagination) pagination.innerHTML = '';
  if(!_catalogReady) await _paintNextFrame();

  let catalogError = null;
  if(typeof ensureCatalogLoaded === 'function'){
    try{
      await ensureCatalogLoaded();
      _catalogReady = true;
    } catch(e){
      // Mantém fallback local (STORE) quando disponível.
      catalogError = e;
    }
  }
  const params = getParams();

  // heading e meta
  const catName = params.cat ? (getCategoryBySlug(params.cat)?.name || (params.cat==='novidades' ? 'Novidades' : params.cat==='promocoes' ? 'Promoções' : 'Catálogo')) : (params.q ? `Resultados para “${params.q}”` : 'Catálogo');
  setText('[data-page-title]', catName);

  const titleEl = document.querySelector('title');
  if(titleEl) titleEl.textContent = `${catName} | Aurora Clothing`;

  const descEl = document.querySelector('meta[name="description"]');
  if(descEl) descEl.setAttribute('content', `Explore ${catName.toLowerCase()} com estética minimalista. Fotos grandes, bons detalhes e compra rápida com entrega em 24h (placeholder).`);

  setCanonical(`${STORE.url}/category.html`);

  const all = getActiveProducts();
  // Se há fallback local carregado, considere o catálogo "pronto" para evitar flicker em re-renders.
  if(!_catalogReady && all && all.length > 0) _catalogReady = true;
  // Se falhou o catálogo remoto e também não há fallback local, exibe erro.
  if(catalogError && (!all || all.length === 0)){
    if(seq !== _renderSeq) return;
    if(grid){
      grid.setAttribute('aria-busy','false');
      renderErrorState(grid, {
        title: 'Não foi possível carregar o catálogo',
        message: catalogError?.message ? `Tente novamente. (${catalogError.message})` : 'Tente novamente.',
        onRetry: () => { _catalogReady = false; renderCategory(); }
      });
    }
    if(pagination) pagination.innerHTML = '';
    return;
  }
  const baseList = applyFilters(all, {cat: params.cat, q: params.q, sort:'relevance', color:'', size:'', minPrice:0, maxPrice:999999});

  // popular opções com base no universo
  renderFiltersOptions(baseList);

  const state = stateFromUI(params);
  const filtered = applyFilters(all, state);

  updateBreadcrumbs(state);

  const perPage = 12;
  const page = clamp(state.page || 1, 1, 999);
  const total = filtered.length;
  const start = (page-1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);

  if(grid){
    grid.setAttribute('aria-busy','false');
    grid.innerHTML = '';
    if(pageItems.length === 0){
      renderEmptyState(grid, {
        title: 'Nenhum produto encontrado',
        message: 'Tente ajustar os filtros ou buscar outro termo.',
        primaryAction: { label: 'Limpar filtros', onClick: () => { _clearAllFilters(); renderCategory(); } },
        secondaryAction: { label: 'Ver catálogo', href: 'category.html' }
      });
    } else {
      if(catalogError){
        grid.appendChild(createErrorState({
          title: 'Dados ao vivo indisponíveis',
          message: 'Exibindo catálogo offline. Você pode tentar novamente para buscar dados atualizados.',
          onRetry: () => { _catalogReady = false; renderCategory(); },
          retryLabel: 'Tentar novamente',
          secondaryAction: null
        }));
      }
      pageItems.forEach(p => grid.appendChild(renderProductCard(p)));
      bindQuickAdd(grid);
    }
  }

  renderPagination(total, page, perPage, {cat: state.cat, q: state.q});
}

function bindCategoryEvents(){
  const triggers = ['[data-sort]','[data-filter-min]','[data-filter-max]'];
  triggers.forEach(sel => {
    const el = document.querySelector(sel);
    if(!el) return;
    el.addEventListener('change', () => {
      // reset page
      const u = new URL(window.location.href);
      u.searchParams.set('page','1');
      history.replaceState({}, '', u.toString());
      renderCategory();
    });
  });

  const clearBtn = document.querySelector('[data-clear-filters]');
  if(clearBtn){
    clearBtn.addEventListener('click', () => {
      _clearAllFilters();
      renderCategory();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCategoryEvents();
  renderCategory();
});
