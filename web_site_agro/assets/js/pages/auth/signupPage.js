import { setText } from '../../utils/sanitize.js';
import { authSignup } from '../../core/customerApi.js';
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

export function initSignupPage(){
  session.redirectIfLoggedIn({ to: 'account.html' });

  const form = document.querySelector('[data-signup-form]');
  const alertEl = document.querySelector('[data-alert]');
  if(!form) return;

  const name = form.querySelector('#name');
  const email = form.querySelector('#email');
  const password = form.querySelector('#password');
  const password2 = form.querySelector('#password2');
  const submit = form.querySelector('[data-submit]');

  const nameErr = form.querySelector('[data-name-error]');
  const emailErr = form.querySelector('[data-email-error]');
  const passErr = form.querySelector('[data-password-error]');
  const pass2Err = form.querySelector('[data-password2-error]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAlert(alertEl, { message: '' });
    showFieldError(nameErr, '');
    showFieldError(emailErr, '');
    showFieldError(passErr, '');
    showFieldError(pass2Err, '');

    const nameVal = String(name?.value || '').trim();
    const emailVal = String(email?.value || '').trim();
    const passVal = String(password?.value || '');
    const pass2Val = String(password2?.value || '');

    let ok = true;
    if(nameVal.length < 2){
      showFieldError(nameErr, 'Informe seu nome.');
      ok = false;
    }
    if(!isEmailLike(emailVal)){
      showFieldError(emailErr, 'Informe um e-mail válido.');
      ok = false;
    }
    if(passVal.length < 6){
      showFieldError(passErr, 'Use pelo menos 6 caracteres.');
      ok = false;
    }
    if(passVal !== pass2Val){
      showFieldError(pass2Err, 'As senhas não conferem.');
      ok = false;
    }
    if(!ok) return;

    if(submit){
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      setText(submit, 'Criando...');
    }

    try {
      const data = await authSignup({ name: nameVal, email: emailVal, password: passVal });
      if(!data || !data.token || !data.user) throw new Error('Resposta inválida do servidor.');
      session.setToken(data.token);
      session.setUser(data.user);

      const next = session.getReturnToFromQuery({ fallback: 'account.html' });
      window.location.replace(next);
    } catch (err){
      showAlert(alertEl, { kind: 'error', message: (err && err.message) ? err.message : 'Não foi possível criar sua conta.' });
    } finally {
      if(submit){
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        setText(submit, 'Criar conta');
      }
    }
  });
}
