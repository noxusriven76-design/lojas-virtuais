import { apiGet, apiPost, ApiError } from './apiClient.js';
import { LV_CONFIG } from '../config.js';

// ---------------------------------------------------------------------------
// Customer/Auth API
//
// Objetivo:
// - Integrar com endpoints reais quando disponveis.
// - Se a API no existir (offline / 404), ativar fallback "mock" em localStorage.
// - Manter assinatura simples e previsvel para pginas (login, conta, pedidos).
// ---------------------------------------------------------------------------

const LV = (window.LV_CONFIG || LV_CONFIG || { USE_MOCK_DATA: false });

const MOCK_USERS_KEY = 'lv_mock_users_v1';
const MOCK_ORDERS_KEY = 'lv_mock_orders_v1';
const MOCK_RESET_KEY = 'lv_mock_pwreset_v1';

function _safeJsonParse(value, fallback){
  try { return JSON.parse(value); } catch { return fallback; }
}

function _readJson(key, fallback){
  return _safeJsonParse(localStorage.getItem(key), fallback);
}

function _writeJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function _nowIso(){
  try { return new Date().toISOString(); } catch { return '' + Date.now(); }
}

function _normEmail(email){
  return String(email || '').trim().toLowerCase();
}

function _hashPw(password){
  // Hash super simples (mock). No use em produo.
  const s = String(password || '');
  let h = 0;
  for(let i=0; i<s.length; i++){
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return 'h' + String(Math.abs(h));
}

function _rand(){
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function _normalizeBearer(token){
  const t = String(token || '').trim();
  if(!t) return '';
  if(t.toLowerCase().startsWith('bearer ')) return t;
  return 'Bearer ' + t;
}

function _stripBearer(token){
  const t = String(token || '').trim();
  if(!t) return '';
  return t.toLowerCase().startsWith('bearer ') ? t.slice(7).trim() : t;
}

function _useMock(){
  return Boolean(LV.USE_MOCK_DATA || window.__USE_MOCK_AUTH__ === true);
}

function _shouldFallbackToMock(err){
  // S cai no mock quando a API no existe / offline.
  // Se a API existe mas retorna 401, o erro deve aparecer ao usurio.
  if(_useMock()) return true;
  if(!(err instanceof ApiError)) return false;
  return (err.status === 0 || err.status === 404 || err.status === 501);
}

// -----------------------------
// Mock implementation
// -----------------------------

function _getMockUsers(){
  const list = _readJson(MOCK_USERS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function _setMockUsers(list){
  _writeJson(MOCK_USERS_KEY, Array.isArray(list) ? list : []);
}

function _getMockOrders(){
  const list = _readJson(MOCK_ORDERS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function _setMockOrders(list){
  _writeJson(MOCK_ORDERS_KEY, Array.isArray(list) ? list : []);
}

function _mockToken(userId){
  return `mock:${userId}:${Date.now()}:${_rand()}`;
}

function _mockTokenUserId(token){
  const raw = _stripBearer(token);
  if(!raw || !raw.startsWith('mock:')) return null;
  const parts = raw.split(':');
  const id = Number(parts[1]);
  return Number.isFinite(id) ? id : null;
}

function _mockEnsureSeed(){
  // Seed leve s para deixar o mock utilizvel no primeiro uso.
  const users = _getMockUsers();
  if(users.length > 0) return;
  const user = {
    id: 1,
    name: 'Cliente Demo',
    email: 'demo@aurora.local',
    pw_hash: _hashPw('123456'),
    created_at: _nowIso(),
  };
  _setMockUsers([user]);
  _mockSeedOrdersForUser(user);
}

function _mockSeedOrdersForUser(user){
  if(!user || !user.id) return;
  const all = _getMockOrders();
  const existing = all.filter(o => o && o.user_id === user.id);
  if(existing.length > 0) return;

  const sample = [
    {
      id: 1001,
      user_id: user.id,
      number: 'AUR-1001',
      status: 'Entregue',
      created_at: _nowIso(),
      currency: 'BRL',
      items: [
        { product_slug: 'vestido-midi-linho', name: 'Vestido Midi Linho', qty: 1, unit_price: 189.9 },
        { product_slug: 'cinto-couro-minimal', name: 'Cinto Couro Minimal', qty: 1, unit_price: 79.9 },
      ],
      shipping: { method: 'Padro', eta_days: 3, address: 'Rua Exemplo, 123 - So Paulo/SP' },
    },
    {
      id: 1002,
      user_id: user.id,
      number: 'AUR-1002',
      status: 'Em separao',
      created_at: _nowIso(),
      currency: 'BRL',
      items: [
        { product_slug: 'camisa-oversized-algodao', name: 'Camisa Oversized Algodo', qty: 2, unit_price: 149.9 },
      ],
      shipping: { method: 'Express', eta_days: 1, address: 'Rua Exemplo, 123 - So Paulo/SP' },
    },
  ];

  sample.forEach(o => {
    o.total = o.items.reduce((sum, it) => sum + (Number(it.unit_price) || 0) * (Number(it.qty) || 0), 0);
  });

  _setMockOrders(all.concat(sample));
}

function _mockLogin({ email, password }){
  _mockEnsureSeed();
  const e = _normEmail(email);
  const pw = _hashPw(password);
  const users = _getMockUsers();
  const u = users.find(x => _normEmail(x.email) === e);
  if(!u || u.pw_hash !== pw){
    throw new ApiError('E-mail ou senha invlidos.', { status: 401, code: 'invalid_credentials' });
  }
  _mockSeedOrdersForUser(u);
  const user = { id: u.id, name: u.name, email: u.email };
  return { token: _mockToken(u.id), user };
}

function _mockSignup({ name, email, password }){
  _mockEnsureSeed();
  const e = _normEmail(email);
  if(!e || !e.includes('@')) throw new ApiError('Informe um e-mail vlido.', { status: 400, code: 'invalid_email' });
  const users = _getMockUsers();
  if(users.some(x => _normEmail(x.email) === e)){
    throw new ApiError('Este e-mail j est cadastrado.', { status: 409, code: 'email_exists' });
  }
  const nextId = users.reduce((m,u) => Math.max(m, Number(u.id)||0), 0) + 1;
  const u = {
    id: nextId,
    name: String(name || '').trim() || 'Cliente',
    email: e,
    pw_hash: _hashPw(password),
    created_at: _nowIso(),
  };
  users.push(u);
  _setMockUsers(users);
  _mockSeedOrdersForUser(u);
  return { token: _mockToken(u.id), user: { id: u.id, name: u.name, email: u.email } };
}

function _mockForgotPassword({ email }){
  _mockEnsureSeed();
  const e = _normEmail(email);
  const users = _getMockUsers();
  const exists = users.some(u => _normEmail(u.email) === e);
  const resets = _readJson(MOCK_RESET_KEY, []);
  const list = Array.isArray(resets) ? resets : [];
  list.push({ email: e, created_at: _nowIso(), exists });
  _writeJson(MOCK_RESET_KEY, list);
  // Sempre retorna ok (boa prtica para no enumerar e-mails).
  return { ok: true };
}

function _mockMe(token){
  _mockEnsureSeed();
  const userId = _mockTokenUserId(token);
  if(!userId) throw new ApiError('No autenticado.', { status: 401, code: 'unauthorized' });
  const users = _getMockUsers();
  const u = users.find(x => Number(x.id) === Number(userId));
  if(!u) throw new ApiError('Sesso invlida.', { status: 401, code: 'invalid_session' });
  return { user: { id: u.id, name: u.name, email: u.email } };
}

function _mockOrders(token){
  const me = _mockMe(token);
  const all = _getMockOrders();
  const list = all.filter(o => o && o.user_id === me.user.id)
    .map(o => ({
      id: o.id,
      number: o.number,
      status: o.status,
      created_at: o.created_at,
      total: o.total,
      currency: o.currency || 'BRL',
      items_count: Array.isArray(o.items) ? o.items.reduce((s,it)=>s+(Number(it.qty)||0),0) : 0,
    }));
  return { orders: list };
}

function _mockOrder(token, id){
  const me = _mockMe(token);
  const all = _getMockOrders();
  const order = all.find(o => o && o.user_id === me.user.id && String(o.id) === String(id));
  if(!order) throw new ApiError('Pedido no encontrado.', { status: 404, code: 'order_not_found' });
  return { order };
}

// -----------------------------
// Public API
// -----------------------------

export async function authLogin({ email, password }){
  if(_useMock()) return _mockLogin({ email, password });
  try {
    return await apiPost('/auth/login', { email, password });
  } catch (err){
    if(_shouldFallbackToMock(err)) return _mockLogin({ email, password });
    throw err;
  }
}

export async function authSignup({ name, email, password }){
  if(_useMock()) return _mockSignup({ name, email, password });
  try {
    return await apiPost('/auth/signup', { name, email, password });
  } catch (err){
    if(_shouldFallbackToMock(err)) return _mockSignup({ name, email, password });
    throw err;
  }
}

export async function authForgotPassword({ email }){
  if(_useMock()) return _mockForgotPassword({ email });
  try {
    return await apiPost('/auth/forgot-password', { email });
  } catch (err){
    if(_shouldFallbackToMock(err)) return _mockForgotPassword({ email });
    throw err;
  }
}

export async function getMe(token){
  if(_useMock()) return _mockMe(token);
  const headers = {};
  const auth = _normalizeBearer(token);
  if(auth) headers['Authorization'] = auth;
  try {
    return await apiGet('/me', null, { headers });
  } catch (err){
    if(_shouldFallbackToMock(err)) return _mockMe(token);
    throw err;
  }
}

export async function getOrders(token){
  if(_useMock()) return _mockOrders(token);
  const headers = {};
  const auth = _normalizeBearer(token);
  if(auth) headers['Authorization'] = auth;
  try {
    return await apiGet('/orders', null, { headers });
  } catch (err){
    if(_shouldFallbackToMock(err)) return _mockOrders(token);
    throw err;
  }
}

export async function getOrder(token, id){
  if(_useMock()) return _mockOrder(token, id);
  const headers = {};
  const auth = _normalizeBearer(token);
  if(auth) headers['Authorization'] = auth;
  const safeId = encodeURIComponent(String(id || '').trim());
  if(!safeId) throw new ApiError('Pedido invlido.', { status: 400, code: 'invalid_order_id' });
  try {
    return await apiGet(`/orders/${safeId}`, null, { headers });
  } catch (err){
    if(_shouldFallbackToMock(err)) return _mockOrder(token, id);
    throw err;
  }
}

