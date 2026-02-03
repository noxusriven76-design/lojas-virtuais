import { apiGet, apiPost } from './core/apiClient.js';
import { createSession } from './core/session.js';

(function(){
  const TOKEN_KEY = 'lv_auth_token_v1';
  const sess = createSession({ tokenKey: TOKEN_KEY, userKey: 'lv_auth_user_v1' });

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

  function normalizeToken(raw){
    const v = (raw || '').trim();
    if(!v) return '';
    if(v.toLowerCase().startsWith('bearer ')) return v;
    return 'Bearer ' + v;
  }

  async function api(path, {method='GET', body=null}={}){
    const token = sess.getToken();
    const headers = {};
    if(token) headers['Authorization'] = normalizeToken(token);

    if(String(method).toUpperCase() === 'POST'){
      return apiPost(path, body, { headers });
    }
    return apiGet(path, null, { headers });
  }

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"']+/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c] || c));
  }

  function renderMessages(list){
    chatBox.innerHTML = '';
    list.forEach(m => {
      const isUser = (m.sender_role !== 'admin');
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.justifyContent = isUser ? 'flex-start' : 'flex-end';

      const bubble = document.createElement('div');
      bubble.style.maxWidth = '520px';
      bubble.style.padding = '10px 12px';
      bubble.style.borderRadius = '12px';
      bubble.style.background = isUser ? '#fafafa' : '#111';
      bubble.style.color = isUser ? '#111' : '#fff';
      bubble.style.border = isUser ? '1px solid #e6e6e6' : '1px solid #111';

      // XSS-safe: apenas texto
      bubble.textContent = String(m.message || '');

      wrap.appendChild(bubble);
      chatBox.appendChild(wrap);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  async function refreshMessages(){
    if(!conversationId) return;
    try{
      const data = await api(`/support/conversations/${conversationId}/messages`);
      const list = Array.isArray(data) ? data : [];
      if(list.length !== lastCount){
        lastCount = list.length;
        renderMessages(list);
      }
    }catch(err){
      showStatus(err?.message || 'Falha ao carregar mensagens.', true);
    }
  }

  async function openConversation(){
    try{
      const data = await api('/support/conversations', { method:'POST', body:{} });
      conversationId = data?.id || null;
      if(!conversationId) throw new Error('Não foi possível abrir a conversa.');
      showStatus('Conversa #' + conversationId + ' aberta.');
      lastCount = 0;
      await refreshMessages();
      if(poll) clearInterval(poll);
      poll = setInterval(refreshMessages, 5000);
    }catch(err){
      showStatus(err?.message || 'Falha ao abrir conversa.', true);
    }
  }

  async function sendMessage(){
    if(!conversationId){ showStatus('Abra uma conversa primeiro.', true); return; }
    const text = (msgEl.value || '').trim();
    if(!text) return;
    msgEl.value = '';
    try{
      await api(`/support/conversations/${conversationId}/messages`, { method:'POST', body:{ message: text } });
      await refreshMessages();
    }catch(err){
      showStatus(err?.message || 'Falha ao enviar mensagem.', true);
    }
  }

  async function closeConversation(){
    if(!conversationId) return;
    try{
      await api(`/support/conversations/${conversationId}/close`, { method:'POST', body:{} });
      showStatus('Conversa encerrada.');
      conversationId = null;
      lastCount = 0;
      chatBox.innerHTML = '';
      if(poll) clearInterval(poll);
    }catch(err){
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

  btnOpen?.addEventListener('click', openConversation);
  btnSend?.addEventListener('click', sendMessage);
  btnClose?.addEventListener('click', closeConversation);

  msgEl?.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });

  // Mensagem inicial
  if(!sess.getToken()){
    showStatus('Cole o token de autenticação acima e clique em “Salvar token”.', false);
  }
})();
