import { STORE } from './products.js';
import { setCanonical, toast } from './main.js';

function validateContact(form){
  const name = form.querySelector('[name="name"]');
  const email = form.querySelector('[name="email"]');
  const message = form.querySelector('[name="message"]');

  function err(input, msg){
    const wrap = input.closest('.field');
    const el = wrap?.querySelector('[data-error]');
    if(el) el.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true':'false');
  }

  let ok = true;
  err(name, ''); err(email, ''); err(message, '');

  if(!name.value.trim()){ err(name, 'Informe seu nome.'); ok=false; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value||'')){ err(email, 'Informe um e-mail válido.'); ok=false; }
  if((message.value||'').trim().length < 10){ err(message, 'Descreva sua dúvida com pelo menos 10 caracteres.'); ok=false; }

  return ok;
}

document.addEventListener('DOMContentLoaded', () => {
  setCanonical(`${STORE.url}/contact.html`);
  const form = document.querySelector('[data-contact-form]');
  if(!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if(!validateContact(form)) return;
    toast('Mensagem enviada (placeholder). Integre com o backend para salvar e notificar.');
    const msg = document.querySelector('[data-contact-success]');
    if(msg){ msg.textContent = 'Recebemos sua mensagem. Retornaremos em breve.'; msg.classList.add('success'); }
    form.reset();
  });
});
