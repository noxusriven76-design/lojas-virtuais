(function(){
  const TOKEN_KEY = 'lv_admin_auth_token_v1';
  const tokenEl = document.getElementById('token');
  const statusBox = document.getElementById('statusBox');
  const convList = document.getElementById('convList');
  const chatBox = document.getElementById('chatBox');
  const msgEl = document.getElementById('msg');
  const btnSaveToken = document.getElementById('btnSaveToken');
  const btnLoad = document.getElementById('btnLoad');
  const btnSend = document.getElementById('btnSend');
  const btnClose = document.getElementById('btnClose');
  const btnRefresh = document.getElementById('btnRefresh');

  let conversationId = null;
  let poll = null;

  function showStatus(text, isError=false){
    statusBox.style.display = 'block';
    statusBox.textContent = text;
    statusBox.style.border = '1px solid ' + (isError ? '#f1b5b5' : '#e6e6e6');
    statusBox.style.background = isError ? '#fff4f4' : '#fafafa';
  }

  function getToken(){
    return (localStorage.getItem(TOKEN_KEY) || '').trim();
  }

  function normalizeToken(raw){
    const v = (raw || '').trim();
    if(!v) return '';
    if(v.toLowerCase().startsWith('bearer ')) return v;
    return 'Bearer ' + v;
  }

  async function api(path, {method='GET', body=null}={}){
    const token = getToken();
    const headers = { 'Accept':'application/json' };
    if(body) headers['Content-Type'] = 'application/json; charset=utf-8';
    if(token) headers['Authorization'] = normalizeToken(token);

    const cfg = (window.LV_CONFIG || { API_BASE_URL: (window.__API_BASE_URL__ || 'http://localhost:8000/api/v1') });
    const base = String(cfg.API_BASE_URL || '').replace(/\/+$/,'');
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

  function escapeHtml(s){
    return (s || '').replace(/[&<>"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c));
  }

  function renderConversations(list){
    convList.innerHTML = '';
    if(list.length === 0){
      convList.innerHTML = '<div class="help">Nenhuma conversa.</div>';
      return;
    }
    list.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.style.textAlign = 'left';
      btn.style.display = 'flex';
      btn.style.justifyContent = 'space-between';
      btn.style.gap = '10px';
      btn.style.padding = '10px 12px';
      btn.style.borderRadius = '12px';
      btn.innerHTML = `<span><strong>#${c.id}</strong> • user ${c.customer_user_id}</span><span class="kbd-hint">${String(c.status).toUpperCase()}</span>`;
      btn.addEventListener('click', async () => {
        conversationId = c.id;
        showStatus('Conversa #' + conversationId + ' selecionada.');
        await refreshMessages();
        if(poll) clearInterval(poll);
        poll = setInterval(refreshMessages, 5000);
      });
      convList.appendChild(btn);
    });
  }

  function renderMessages(list){
    chatBox.innerHTML = '';
    list.forEach(m => {
      const isAdmin = (m.sender_role === 'admin');
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.justifyContent = isAdmin ? 'flex-end' : 'flex-start';

      const bubble = document.createElement('div');
      bubble.style.maxWidth = '520px';
      bubble.style.border = '1px solid rgba(0,0,0,.12)';
      bubble.style.borderRadius = '14px';
      bubble.style.padding = '12px';
      bubble.style.background = isAdmin ? '#fff' : 'rgba(0,0,0,.03)';

      bubble.innerHTML = `<div style="font-size:12px; font-weight:700; color:rgba(0,0,0,.55); margin-bottom:6px">${isAdmin ? 'Você (Admin)' : 'Cliente'}</div>
                          <div style="white-space:pre-wrap">${escapeHtml(m.body || '')}</div>`;

      wrap.appendChild(bubble);
      chatBox.appendChild(wrap);
    });
  }

  async function loadConversations(){
    showStatus('Carregando conversas…');
    const list = await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations?status=open&limit=50`);
    renderConversations(Array.isArray(list) ? list : []);
    showStatus('Conversas carregadas.');
  }

  async function refreshMessages(){
    if(!conversationId) return;
    const list = await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations/${conversationId}/messages`);
    if(Array.isArray(list)) renderMessages(list);
  }

  async function send(){
    if(!conversationId){ showStatus('Selecione uma conversa.', true); return; }
    const text = (msgEl.value || '').trim();
    if(!text) return;
    await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations/${conversationId}/messages`, {method:'POST', body:{body:text}});
    msgEl.value = '';
    await refreshMessages();
  }

  async function close(){
    if(!conversationId){ showStatus('Selecione uma conversa.', true); return; }
    await api(`/support/${encodeURIComponent(STORE?.slug || '')}/conversations/${conversationId}/close`, {method:'POST'});
    showStatus('Conversa #' + conversationId + ' encerrada.');
    conversationId = null;
    if(poll) clearInterval(poll);
    await loadConversations();
    chatBox.innerHTML = '';
  }

  // init
  tokenEl.value = localStorage.getItem(TOKEN_KEY) || '';

  btnSaveToken.addEventListener('click', () => {
    const t = (tokenEl.value || '').trim();
    localStorage.setItem(TOKEN_KEY, t);
    showStatus(t ? 'Token salvo.' : 'Token removido.');
  });

  btnLoad.addEventListener('click', async () => {
    try{ await loadConversations(); }
    catch(e){ showStatus(e.message || 'Falha ao carregar.', true); }
  });

  btnSend.addEventListener('click', async () => {
    try{ await send(); }
    catch(e){ showStatus(e.message || 'Falha ao enviar.', true); }
  });

  btnClose.addEventListener('click', async () => {
    try{ await close(); }
    catch(e){ showStatus(e.message || 'Falha ao encerrar.', true); }
  });

  btnRefresh?.addEventListener('click', async () => {
    try{
      if(conversationId) await refreshMessages();
      await loadConversations();
    }catch(e){
      showStatus(e.message || 'Falha ao atualizar.', true);
    }
  });
})();
