import { LV_CONFIG } from '../config.js';

export class ApiError extends Error {
  constructor(message, { status=0, code=null, requestId=null, url='' }={}){
    super(message || 'Erro na requisição');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.url = url;
  }
}

function _baseUrl(){
  const cfg = (window.LV_CONFIG || LV_CONFIG || {});
  return String(cfg.API_BASE_URL || '').replace(/\/+$/,'');
}

function _buildUrl(path, params){
  const base = _baseUrl();
  const p = String(path || '');
  const url = p.startsWith('http://') || p.startsWith('https://')
    ? new URL(p)
    : new URL(base + (p.startsWith('/') ? p : '/' + p));

  if(params && typeof params === 'object'){
    Object.entries(params).forEach(([k,v]) => {
      if(v == null) return;
      url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

async function _request(method, path, { params=null, body=null, timeoutMs=10000, headers={} }={}){
  const url = _buildUrl(path, params);
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);

  const h = {
    Accept: 'application/json',
    ...headers,
  };
  let payload = null;
  if(body != null){
    h['Content-Type'] = 'application/json; charset=utf-8';
    payload = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, {
      method,
      headers: h,
      body: payload,
      signal: ctrl.signal,
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = text; }

    if(!res.ok){
      const msg = (data && data.error && data.error.message) ? data.error.message
        : (data && data.detail) ? data.detail
        : ('HTTP ' + res.status);
      const requestId = (data && data.error && data.error.request_id)
        ? data.error.request_id
        : (res.headers.get('x-request-id') || null);
      const message = requestId ? `${msg} (ref: ${requestId})` : msg;
      throw new ApiError(message, { status: res.status, requestId, url });
    }

    return data;
  } catch (err){
    if(err && err.name === 'AbortError'){
      throw new ApiError('Tempo limite excedido. Tente novamente.', { status: 0, code: 'timeout', url });
    }
    if(err instanceof ApiError) throw err;
    throw new ApiError(err?.message || 'Falha na requisição.', { status: 0, url });
  } finally {
    window.clearTimeout(t);
  }
}

export function apiGet(path, params=null, opts={}){
  return _request('GET', path, { ...opts, params });
}

export function apiPost(path, body, opts={}){
  return _request('POST', path, { ...opts, body });
}
