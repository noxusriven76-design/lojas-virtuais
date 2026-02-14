import { apiGet, apiPost } from './core/apiClient.js';
import { createSession } from './core/session.js';
import { escapeHtml } from './utils/sanitize.js';

(function(){
  const TOKEN_KEY = 'lv_admin_auth_token_v1';
  const sess = createSession({ tokenKey: TOKEN_KEY, userKey: 'lv_admin_user_v1' });

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

  function normalizeToken(raw){
    const v = (raw || '').trim();
    if(!v) return '';
    if(v.toLowerCase().startsWith('bearer ')) return v;
    return 'Bearer ' + v;
  }

  async function api(path, { method='GET', body=null }={}){
    const token = sess.getToken();
    const headers = {};
    if(token) headers.Authorization = normalizeToken(token);
    if(String(method).toUpperCase() === 'POST') return apiPost(path, body, { headers });
    return apiGet(path, null, { headers });
  }

  function renderConversations(list){
    convList.innerHTML = '';
    if(list.length === 0){
      const h = document.createElement('div');
      h.className = 'help';
      h.textContent = 'Nenhuma conversa.';
      convList.appendChild(h);
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

      const left = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `#${String(c.id)}`;
      left.appendChild(strong);
      left.appendChild(document.createTextNode(` • user ${String(c.customer_user_id)}`));

      const right = document.createElement('span');
      right.className = 'kbd-hint';
      right.textContent = String(c.status || '').toUpperCase();

      btn.appendChild(left);
      btn.appendChild(right);
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
      bubble.style.padding = '10px 12px';
      bubble.style.borderRadius = '12px';
      bubble.style.border = '1px solid #e6e6e6';
      bubble.style.background = isAdmin ? '#111' : '#fff';
      bubble.style.color = isAdmin ? '#fff' : '#111';
      bubble.style.whiteSpace = 'pre-wrap';
      // NÃO usar innerHTML: mensagens vêm da API
      bubble.textContent = String(m.message || '');

      const meta = document.createElement('div');
      meta.className = 'help';
      meta.style.marginTop = '6px';
      meta.style.opacity = '0.8';
      meta.textContent = `${escapeHtml(String(m.sender_role || 'user'))} • ${escapeHtml(String(m.created_at || ''))}`;

      const box = document.createElement('div');
      box.appendChild(bubble);
      box.appendChild(meta);
      wrap.appendChild(box);
      chatBox.appendChild(wrap);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  async function loadConversations(){
    try {
      showStatus('Carregando conversas...');
      const list = await api('/support/admin/conversations');
      renderConversations(Array.isArray(list) ? list : []);
      showStatus('Conversas carregadas.');
    } catch (err){
      showStatus(err?.message || 'Falha ao carregar conversas.', true);
    }
  }

  async function refreshMessages(){
    if(!conversationId) return;
    try {
      const list = await api(`/support/admin/conversations/${conversationId}/messages`);
      renderMessages(Array.isArray(list) ? list : []);
    } catch (err){
      showStatus(err?.message || 'Falha ao carregar mensagens.', true);
    }
  }

  async function sendMessage(){
    if(!conversationId){ showStatus('Selecione uma conversa.', true); return; }
    const text = (msgEl.value || '').trim();
    if(!text) return;
    msgEl.value = '';
    try {
      await api(`/support/admin/conversations/${conversationId}/messages`, { method:'POST', body: { message: text } });
      await refreshMessages();
    } catch (err){
      showStatus(err?.message || 'Falha ao enviar mensagem.', true);
    }
  }

  async function closeConversation(){
    if(!conversationId){ showStatus('Selecione uma conversa.', true); return; }
    try {
      await api(`/support/admin/conversations/${conversationId}/close`, { method:'POST', body: {} });
      showStatus('Conversa encerrada.');
      conversationId = null;
      chatBox.innerHTML = '';
      if(poll) clearInterval(poll);
      await loadConversations();
    } catch (err){
      showStatus(err?.message || 'Falha ao encerrar conversa.', true);
    }
  }

  // Init UI
  tokenEl.value = sess.getToken();
  btnSaveToken?.addEventListener('click', () => {
    const t = (tokenEl.value || '').trim();
    sess.setToken(t);
    showStatus(t ? 'Token salvo.' : 'Token removido.');
  });

  btnLoad?.addEventListener('click', loadConversations);
  btnRefresh?.addEventListener('click', refreshMessages);
  btnSend?.addEventListener('click', sendMessage);
  btnClose?.addEventListener('click', closeConversation);

  msgEl?.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });

  if(!sess.getToken()){
    showStatus('Cole o token ADMIN acima e clique em “Salvar token”.', false);
  }
})();
