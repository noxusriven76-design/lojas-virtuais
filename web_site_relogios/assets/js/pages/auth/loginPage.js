import { setText } from '../../utils/sanitize.js';
import { authLogin } from '../../core/customerApi.js';
import { session } from '../../core/session.js';

function showAlert(alertEl, { kind='info', message='' }={}){
  if(!alertEl) return;
  // kind: info | success | error
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

export function initLoginPage(){
  // Se j estiver logado, manda para a conta.
  session.redirectIfLoggedIn({ to: 'account.html' });

  const form = document.querySelector('[data-login-form]');
  const alertEl = document.querySelector('[data-alert]');
  if(!form) return;

  const email = form.querySelector('#email');
  const password = form.querySelector('#password');
  const submit = form.querySelector('[data-submit]');

  const emailErr = form.querySelector('[data-email-error]');
  const passErr = form.querySelector('[data-password-error]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAlert(alertEl, { message: '' });
    showFieldError(emailErr, '');
    showFieldError(passErr, '');

    const emailVal = String(email?.value || '').trim();
    const passVal = String(password?.value || '');

    let ok = true;
    if(!isEmailLike(emailVal)){
      showFieldError(emailErr, 'Informe um e-mail vlido.');
      ok = false;
    }
    if(passVal.length < 4){
      showFieldError(passErr, 'Informe sua senha.');
      ok = false;
    }
    if(!ok) return;

    if(submit) {
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      setText(submit, 'Entrando...');
    }

    try {
      const data = await authLogin({ email: emailVal, password: passVal });
      if(!data || !data.token || !data.user) throw new Error('Resposta invlida do servidor.');
      session.setToken(data.token);
      session.setUser(data.user);

      const next = session.getReturnToFromQuery({ fallback: 'account.html' });
      window.location.replace(next);
    } catch (err){
      const status = (err && typeof err.status === 'number') ? err.status : 0;
      if(status === 401 || status === 403){
        showAlert(alertEl, { kind: 'error', message: 'E-mail ou senha invlidos.' });
      } else {
        showAlert(alertEl, { kind: 'error', message: (err && err.message) ? err.message : 'No foi possvel entrar agora.' });
      }
    } finally {
      if(submit) {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        setText(submit, 'Entrar');
      }
    }
  });
}

