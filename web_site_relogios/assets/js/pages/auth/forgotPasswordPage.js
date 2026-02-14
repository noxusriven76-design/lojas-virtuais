import { setText } from '../../utils/sanitize.js';
import { authForgotPassword } from '../../core/customerApi.js';
import { session } from '../../core/session.js';

function showAlert(alertEl, { kind='info', message='' }={}){
  if(!alertEl) return;
  alertEl.style.display = message ? 'block' : 'none';
  while(alertEl.firstChild) alertEl.removeChild(alertEl.firstChild);
  if(!message) return;
  const p = document.createElement('p');
  p.className = kind === 'success' ? 'success' : (kind === 'error' ? 'error' : '');
  setText(p, message);
  alertEl.appendChild(p);
}

function showFieldError(el, msg){
  if(!el) return;
  if(msg){
    el.style.display = 'block';
    setText(el, msg);
  } else {
    el.style.display = 'none';
    setText(el, '');
  }
}

function isEmailLike(v){
  const s = String(v || '').trim();
  return /.+@.+\..+/.test(s);
}

export function initForgotPasswordPage(){
  // Se j estiver logado, no faz muito sentido recuperar senha aqui.
  session.redirectIfLoggedIn({ to: 'account.html' });

  const form = document.querySelector('[data-forgot-form]');
  const alertEl = document.querySelector('[data-alert]');
  if(!form) return;

  const email = form.querySelector('#email');
  const submit = form.querySelector('[data-submit]');
  const emailErr = form.querySelector('[data-email-error]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAlert(alertEl, { message: '' });
    showFieldError(emailErr, '');

    const emailVal = String(email?.value || '').trim();
    if(!isEmailLike(emailVal)){
      showFieldError(emailErr, 'Informe um e-mail vlido.');
      return;
    }

    if(submit){
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      setText(submit, 'Enviando...');
    }

    try {
      await authForgotPassword({ email: emailVal });
      showAlert(alertEl, { kind: 'success', message: 'Se o e-mail estiver cadastrado, voc receber instrues em instantes.' });
      if(email) email.value = '';
    } catch (err){
      // Mesmo em erro, mantemos mensagem neutra.
      showAlert(alertEl, { kind: 'success', message: 'Se o e-mail estiver cadastrado, voc receber instrues em instantes.' });
    } finally {
      if(submit){
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        setText(submit, 'Enviar');
      }
    }
  });
}

