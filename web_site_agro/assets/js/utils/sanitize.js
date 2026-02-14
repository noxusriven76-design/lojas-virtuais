/*
  XSS safety helpers.

  Use estas funções sempre que renderizar dados dinâmicos vindos de:
  - API
  - localStorage
  - querystring

  Regra prática:
  - prefira textContent (setText)
  - evite innerHTML (setSafeHtml só para templates internos/trusteds)
*/

export function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function _resolveEl(elOrSelector){
  if(!elOrSelector) return null;
  if(typeof elOrSelector === 'string') return document.querySelector(elOrSelector);
  return elOrSelector;
}

export function setText(elOrSelector, str){
  const el = _resolveEl(elOrSelector);
  if(!el) return;
  el.textContent = String(str == null ? '' : str);
}

export function setSafeHtml(elOrSelector, html){
  const el = _resolveEl(elOrSelector);
  if(!el) return;
  // WARNING: use apenas com HTML interno/trusted (nunca com API/user input)
  el.innerHTML = String(html == null ? '' : html);
}

// Evita javascript: e outros esquemas perigosos.
export function safeUrl(url, {allowDataImages=false}={}){
  const s = String(url == null ? '' : url).trim();
  if(!s) return '';
  // allow relative URLs
  if(s.startsWith('/') || s.startsWith('./') || s.startsWith('../')) return s;
  // allow simple relative without leading slash
  if(!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s;

  const lower = s.toLowerCase();
  if(lower.startsWith('http://') || lower.startsWith('https://')) return s;
  if(allowDataImages && lower.startsWith('data:image/')) return s;
  return '';
}

// Compatibilidade com scripts legados que usam globais.
window.escapeHtml = escapeHtml;
window.setText = setText;
window.setSafeHtml = setSafeHtml;
window.safeUrl = safeUrl;
