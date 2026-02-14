import { safeUrl, setText } from '../utils/sanitize.js';

function clearEl(el){
  if(!el) return;
  while(el.firstChild) el.removeChild(el.firstChild);
}

function make(tag, className){
  const el = document.createElement(tag);
  if(className) el.className = className;
  return el;
}

function skeletonLine({ width='100%', height=12 }={}){
  const d = make('div', 'skeleton skeleton-line');
  d.style.width = width;
  d.style.height = `${height}px`;
  return d;
}

export function createSkeletonCard(){
  const article = make('article', 'card skeleton-card');
  article.setAttribute('aria-hidden', 'true');

  const media = make('div', 'card-media skeleton');
  media.setAttribute('aria-hidden', 'true');

  const body = make('div', 'card-body');
  body.appendChild(skeletonLine({ width: '72%', height: 14 }));
  body.appendChild(skeletonLine({ width: '92%', height: 12 }));
  body.appendChild(skeletonLine({ width: '58%', height: 12 }));

  const actions = make('div', 'card-actions');
  const a1 = make('div', 'skeleton skeleton-pill');
  a1.style.width = '88px';
  a1.style.height = '36px';
  const a2 = make('div', 'skeleton skeleton-pill');
  a2.style.width = '108px';
  a2.style.height = '36px';
  actions.appendChild(a1);
  actions.appendChild(a2);

  body.appendChild(actions);
  article.appendChild(media);
  article.appendChild(body);
  return article;
}

export function renderSkeletonGrid(container, { count=12 }={}){
  if(!container) return;
  clearEl(container);
  for(let i=0; i<count; i++) container.appendChild(createSkeletonCard());
}

function actionEl(action, { primary=false }={}){
  if(!action) return null;
  const label = String(action.label || 'Ao');
  const cls = primary ? 'btn btn-primary btn-sm' : 'btn btn-sm';

  if(typeof action.onClick === 'function'){
    const b = make('button', cls);
    b.type = 'button';
    setText(b, label);
    b.addEventListener('click', action.onClick);
    return b;
  }

  const href = safeUrl(action.href || '') || '';
  const a = make('a', cls);
  a.href = href || '#';
  if(!href) a.setAttribute('aria-disabled', 'true');
  setText(a, label);
  return a;
}

function createStateCard({
  kind='info',
  icon='??',
  title='Aviso',
  message='',
  primaryAction=null,
  secondaryAction=null,
  ariaLive='polite'
}={}){
  const wrap = make('div', `state state-${kind}`);
  wrap.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  wrap.setAttribute('aria-live', ariaLive);

  const head = make('div', 'state-head');
  const ic = make('div', 'state-icon');
  ic.setAttribute('aria-hidden', 'true');
  ic.textContent = String(icon || '');
  const txt = make('div', 'state-text');
  const h = make('h3');
  setText(h, title);
  const p = make('p');
  setText(p, message);
  txt.appendChild(h);
  txt.appendChild(p);
  head.appendChild(ic);
  head.appendChild(txt);
  wrap.appendChild(head);

  const actions = make('div', 'state-actions');
  const a1 = actionEl(primaryAction, { primary:true });
  const a2 = actionEl(secondaryAction, { primary:false });
  if(a1) actions.appendChild(a1);
  if(a2) actions.appendChild(a2);
  if(actions.childElementCount > 0) wrap.appendChild(actions);

  return wrap;
}

export function createErrorState({
  title='No foi possvel carregar',
  message='Verifique sua conexo e tente novamente.',
  onRetry=null,
  retryLabel='Tentar novamente',
  secondaryAction={ label: 'Voltar para home', href: 'index.html' }
}={}){
  return createStateCard({
    kind: 'error',
    icon: '??',
    title,
    message,
    primaryAction: (typeof onRetry === 'function') ? { label: retryLabel, onClick: onRetry } : null,
    secondaryAction,
    ariaLive: 'assertive'
  });
}

export function createEmptyState({
  title='Nenhum resultado',
  message='Nada encontrado para os filtros atuais.',
  primaryAction=null,
  secondaryAction=null
}={}){
  return createStateCard({
    kind: 'empty',
    icon: '???',
    title,
    message,
    primaryAction,
    secondaryAction,
    ariaLive: 'polite'
  });
}

export function renderErrorState(container, {
  title='No foi possvel carregar',
  message='Verifique sua conexo e tente novamente.',
  onRetry=null,
  retryLabel='Tentar novamente',
  secondaryAction={ label: 'Voltar para home', href: 'index.html' }
}={}){
  if(!container) return;
  const state = createErrorState({ title, message, onRetry, retryLabel, secondaryAction });
  clearEl(container);
  container.appendChild(state);
  return state;
}

export function renderEmptyState(container, {
  title='Nenhum resultado',
  message='Nada encontrado para os filtros atuais.',
  primaryAction=null,
  secondaryAction=null
}={}){
  if(!container) return;
  const state = createEmptyState({ title, message, primaryAction, secondaryAction });
  clearEl(container);
  container.appendChild(state);
  return state;
}

export function createProductSkeleton(){
  const frag = document.createDocumentFragment();

  const gallery = make('div', 'gallery');
  const main = make('div', 'gallery-main skeleton');
  gallery.appendChild(main);

  const thumbs = make('div', 'thumbs');
  for(let i=0; i<4; i++){
    const t = make('div', 'thumb skeleton');
    t.setAttribute('aria-hidden', 'true');
    thumbs.appendChild(t);
  }
  gallery.appendChild(thumbs);

  const info = make('article', 'product-info');
  info.appendChild(skeletonLine({ width: '68%', height: 18 }));
  info.appendChild(skeletonLine({ width: '38%', height: 12 }));
  info.appendChild(skeletonLine({ width: '92%', height: 12 }));
  info.appendChild(skeletonLine({ width: '86%', height: 12 }));
  info.appendChild(skeletonLine({ width: '74%', height: 12 }));

  const sep = make('hr', 'sep');
  info.appendChild(sep);

  const priceRow = make('div', 'price');
  const p1 = make('div', 'skeleton skeleton-pill');
  p1.style.width = '120px';
  p1.style.height = '22px';
  const p2 = make('div', 'skeleton skeleton-pill');
  p2.style.width = '70px';
  p2.style.height = '18px';
  priceRow.appendChild(p1);
  priceRow.appendChild(p2);
  info.appendChild(priceRow);

  const actions = make('div', 'card-actions');
  const b1 = make('div', 'skeleton skeleton-pill');
  b1.style.width = '160px';
  b1.style.height = '44px';
  const b2 = make('div', 'skeleton skeleton-pill');
  b2.style.width = '140px';
  b2.style.height = '44px';
  actions.appendChild(b1);
  actions.appendChild(b2);
  actions.style.marginTop = '14px';
  info.appendChild(actions);

  frag.appendChild(gallery);
  frag.appendChild(info);
  return frag;
}

