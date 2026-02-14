import { getMe } from './customerApi.js';

const DEFAULT_TOKEN_KEY = 'lv_auth_token_v1';
const DEFAULT_USER_KEY = 'lv_auth_user_v1';

function _safeJsonParse(value, fallback=null){
  try { return JSON.parse(value); } catch { return fallback; }
}

export function createSession({ tokenKey=DEFAULT_TOKEN_KEY, userKey=DEFAULT_USER_KEY }={}){
  function _stripBearer(token){
    const t = (token || '').trim();
    if(!t) return '';
    return t.toLowerCase().startsWith('bearer ') ? t.slice(7).trim() : t;
  }

  function _currentRelativeUrl(){
    try {
      const u = new URL(window.location.href);
      const parts = (u.pathname || '').split('/').filter(Boolean);
      const file = parts.length ? parts[parts.length - 1] : 'index.html';
      const name = file.includes('.') ? file : (file + '.html');
      return name + (u.search || '') + (u.hash || '');
    } catch {
      return 'index.html';
    }
  }

  function _safeReturnTo(value, fallback='account.html'){
    const v = String(value || '').trim();
    if(!v) return fallback;
    const lower = v.toLowerCase();
    // Bloqueia esquemas, protocolos e URLs "protocol-relative"
    if(lower.startsWith('javascript:') || lower.startsWith('data:') || lower.includes('://') || lower.startsWith('//')){
      return fallback;
    }
    // Bloqueia CRLF/whitespace estranhos
    if(/[\r\n\t]/.test(v)) return fallback;
    // Permite apenas navegao dentro do prprio site (arquivos .html)
    // Ex.: "orders.html?id=1" ou "./orders.html?id=1".
    return v;
  }

  function buildLoginHref({ returnTo=null }={}){
    const rt = _safeReturnTo(returnTo || _currentRelativeUrl(), 'account.html');
    // Evita "login -> login"
    if(rt.startsWith('login.html')) return 'login.html';
    return `login.html?returnTo=${encodeURIComponent(rt)}`;
  }
  function getToken(){
    return (localStorage.getItem(tokenKey) || '').trim();
  }

  function setToken(token){
    const t = (token || '').trim();
    if(!t) localStorage.removeItem(tokenKey);
    else localStorage.setItem(tokenKey, t);
    window.dispatchEvent(new CustomEvent('lv:session', { detail: { token: t } }));
  }

  function getUser(){
    return _safeJsonParse(localStorage.getItem(userKey) || 'null', null);
  }

  function setUser(user){
    if(!user) localStorage.removeItem(userKey);
    else localStorage.setItem(userKey, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent('lv:session', { detail: { user } }));
  }

  function isLoggedIn(){
    return Boolean(getToken());
  }

  async function refreshUser(){
    const token = getToken();
    if(!token) return null;
    try {
      const data = await getMe(token);
      const user = (data && data.user) ? data.user : null;
      if(user) setUser(user);
      return user;
    } catch (err){
      // Se token invlido, limpa sesso.
      const status = (err && typeof err.status === 'number') ? err.status : 0;
      if(status === 401 || status === 403){
        logout();
      }
      throw err;
    }
  }

  function requireAuth({ redirectTo='login.html', validate=false }={}){
    if(!isLoggedIn()){
      const href = `${redirectTo}?returnTo=${encodeURIComponent(_currentRelativeUrl())}`;
      window.location.replace(href);
      return false;
    }
    if(validate){
      // dispara validao assncrona (sem bloquear a navegao)
      refreshUser().catch(() => {
        const href = `${redirectTo}?returnTo=${encodeURIComponent(_currentRelativeUrl())}`;
        window.location.replace(href);
      });
    }
    return true;
  }

  function redirectIfLoggedIn({ to='account.html' }={}){
    if(isLoggedIn()) window.location.replace(_safeReturnTo(to, 'account.html'));
  }

  function getReturnToFromQuery({ param='returnTo', fallback='account.html' }={}){
    try {
      const u = new URL(window.location.href);
      return _safeReturnTo(u.searchParams.get(param), fallback);
    } catch {
      return fallback;
    }
  }

  function logout(){
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    window.dispatchEvent(new CustomEvent('lv:logout', { detail: { tokenKey, userKey } }));
  }

  return {
    getToken,
    setToken,
    getUser,
    setUser,
    isLoggedIn,
    logout,
    refreshUser,
    requireAuth,
    redirectIfLoggedIn,
    getReturnToFromQuery,
    buildLoginHref,
    tokenKey,
    userKey,
    // expostos para pginas/depurao
    _stripBearer,
    _safeReturnTo,
    _currentRelativeUrl,
  };
}

// Sesso padro (site)
export const session = createSession();

