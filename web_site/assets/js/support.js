(function(){
  const TOKEN_KEY = 'lv_auth_token_v1';
  const tokenEl = document.getElementById('token');
  const msgEl = document.getElementById('msg');
  const chatBox = document.getElementById('chatBox');
  const statusBox = document.getElementById('statusBox');
  const btnSaveToken = document.getElementById('btnSaveToken');
  const btnOpen = document.getElementById('btnOpen');
  const btnSend = document.getElementById('btnSend');
  const btnClose = document.getElementById('btnClose');

  let conversationId = null;
  let poll = null;
  let lastCount = 0;

  function showStatus(text, isError=false){
    statusBox.style.display = 'block';
    statusBox.textContent = text;
    statusBox.style.border = '1px solid ' + (isError ? '#f1b5b5' : '#e6e6e6');
    statusBox.style.background = isError ? '#fff4f4' : '#fafafa';
  }

  function getToken(){
    const raw = (localStorage.getItem(TOKEN_KEY) || '').trim();
    return raw;
  }

  function normalizeToken(raw){
    const v = (raw || '').trim();
    if(!v) return '';
    if(v.toLowerCase().startsWith('bearer ')) return v;
    return 'Bearer ' + v;
  }

  async function api(path, {method='GET', body=null}={}){
    const cfg = (window.LV_CONFIG || { API_BASE_URL: (window.__API_BASE_URL__ || 'http://localhost:8000/api/v1') });
    const base = String(cfg.API_BASE_URL || '').replace(/\/+$/,'');
    const token = getToken();
    const headers = { 'Accept':'application/json' };
    if(body) headers['Content-Type'] = 'application/json; charset=utf-8';
    if(token) headers['Authorization'] = normalizeToken(token);

    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    const text = await res.text();
    let json;
    try{ json = text ? JSON.parse(text) : null; }
    catch(_){ json = text; }

    if(!res.ok){
      const msg = (json && json.error && json.error.message) ? json.error.message
        : (json && json.detail) ? json.detail
        : ('HTTP ' + res.status);
      const requestId = (json && json.error && json.error.request_id) ? json.error.request_id : res.headers.get('x-request-id');
      const detail = requestId ? `${msg} (ref: ${requestId})` : msg;
      throw new Error(detail);
    }
    return json;
  }

  function renderMessages(list){
    chatBox.innerHTML = '';
    list.forEach(m => {
      const isAdmin = (m.sender_role === 'admin');
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.justifyContent = isAdmin ? 'flex-start' : 'flex-end';

      const bubble = document.createElement('div');
      bubble.style.maxWidth = '520px';
      bubble.style.border = '1px solid rgba(0,0,0,.12)';
      bubble.style.borderRadius = '14px';
      bubble.style.padding = '12px';
      bubble.style.background = isAdmin ? 'rgba(0,0,0,.03)' : '#fff';

      bubble.innerHTML = `<div style="font-size:12px; font-weight:700; color:rgba(0,0,0,.55); margin-bottom:6px">${isAdmin ? 'Admin' : 'Você'}</div>
                          <div style="white-space:pre-wrap">${escapeHtml(m.body || '')}</div>`;

      wrap.appendChild(bubble);
      chatBox.appendChild(wrap);
    });

    // scroll to bottom
    chatBox.parentElement?.scrollIntoView({block:'end'});
  }

  function escapeHtml(s){
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function openConversation(){
    showStatus('Abrindo conversa…');
    const data = await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations`, {method:'POST'});
    conversationId = data.id;
    showStatus('Conversa #' + conversationId + ' • ' + String(data.status || 'open').toUpperCase());
    await refresh();
    if(poll) clearInterval(poll);
    poll = setInterval(refresh, 5000);
  }

  async function refresh(){
    if(!conversationId) return;
    const list = await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations/${conversationId}/messages`);
    if(Array.isArray(list)){
      renderMessages(list);
      if(list.length !== lastCount){ lastCount = list.length; }
    }
  }

  async function send(){
    const text = (msgEl.value || '').trim();
    if(!text) return;
    if(!conversationId){
      showStatus('Abra uma conversa primeiro.', true);
      return;
    }
    await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations/${conversationId}/messages`, {method:'POST', body:{body:text}});
    msgEl.value = '';
    await refresh();
  }

  async function close(){
    if(!conversationId) return;
    const data = await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations/${conversationId}/close`, {method:'POST'});
    showStatus('Conversa #' + conversationId + ' • ' + String(data.status || 'closed').toUpperCase());
    if(poll) clearInterval(poll);
  }

  // init
  tokenEl.value = localStorage.getItem(TOKEN_KEY) || '';

  btnSaveToken.addEventListener('click', () => {
    const t = (tokenEl.value || '').trim();
    localStorage.setItem(TOKEN_KEY, t);
    showStatus(t ? 'Token salvo.' : 'Token removido.');
  });

  btnOpen.addEventListener('click', async () => {
    try{
      await openConversation();
    }catch(e){
      showStatus(e.message || 'Falha ao abrir conversa.', true);
    }
  });

  btnSend.addEventListener('click', async () => {
    try{
      await send();
    }catch(e){
      showStatus(e.message || 'Falha ao enviar.', true);
    }
  });

  btnClose.addEventListener('click', async () => {
    try{
      await close();
    }catch(e){
      showStatus(e.message || 'Falha ao encerrar.', true);
    }
  });
})();
