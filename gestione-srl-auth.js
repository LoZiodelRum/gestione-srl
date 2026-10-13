(() => {
  const DRINKWISE_REDEEM_URL = 'https://drinkwise.it/api/public/gestione-srl-redeem';
  const RESET_URL = 'https://drinkwise.it/reset-password';

  function getSb() { return window.gestioneSrlSupabase || null; }
  function authErrorEl() { return document.getElementById('srlAuthError'); }
  function overlayEl() { return document.getElementById('srlAuthOverlay'); }

  function setMessage(message, isError = false) {
    const el = authErrorEl();
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#b42318' : '#365a86';
  }

  function addForgotPassword() {
    const overlay = overlayEl();
    if (!overlay || document.getElementById('srlForgotPasswordBtn')) return;
    const card = overlay.querySelector('.srl-auth-card');
    const err = authErrorEl();
    if (!card || !err) return;

    const btn = document.createElement('button');
    btn.id = 'srlForgotPasswordBtn';
    btn.type = 'button';
    btn.textContent = 'PASSWORD DIMENTICATA?';
    btn.style.background = 'transparent';
    btn.style.color = '#173b6f';
    btn.style.border = '1px solid #cbd6e3';
    btn.style.marginTop = '10px';
    btn.onclick = async () => {
      const sb = getSb();
      const email = document.getElementById('srlAuthEmail')?.value?.trim();
      if (!sb) return setMessage('Connessione non disponibile.', true);
      if (!email) return setMessage('Inserisci prima il tuo indirizzo email.', true);
      btn.disabled = true;
      btn.textContent = 'INVIO IN CORSO...';
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RESET_URL });
      btn.disabled = false;
      btn.textContent = 'PASSWORD DIMENTICATA?';
      if (error) return setMessage('Non è stato possibile inviare il link. Riprova.', true);
      setMessage('Link per reimpostare la password inviato alla tua email.');
    };
    err.insertAdjacentElement('beforebegin', btn);
  }

  async function consumeDrinkwiseHandoff() {
    const sb = getSb();
    if (!sb) return false;

    const params = new URLSearchParams(location.search);
    const token = params.get('handoff');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;

    history.replaceState(null, '', location.pathname + location.hash);
    setMessage('Accesso automatico da DrinkWise in corso...');

    try {
      const response = await fetch(DRINKWISE_REDEEM_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!response.ok) {
        setMessage('Accesso automatico non valido o scaduto. Accedi con email e password.', true);
        return false;
      }
      const body = await response.json();
      if (!body?.token_hash) {
        setMessage('Accesso automatico non disponibile. Accedi con email e password.', true);
        return false;
      }
      const { error } = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: body.token_hash });
      if (error) {
        setMessage('Accesso automatico non riuscito. Accedi con email e password.', true);
        return false;
      }
      overlayEl()?.classList.add('hidden');
      setMessage('');
      return true;
    } catch (error) {
      console.error('Gestione SRL handoff:', error);
      setMessage('Errore di collegamento con DrinkWise. Accedi con email e password.', true);
      return false;
    }
  }

  async function init() {
    for (let i = 0; i < 50 && !getSb(); i++) await new Promise(r => setTimeout(r, 100));
    if (!getSb()) return;
    for (let i = 0; i < 50 && !overlayEl(); i++) await new Promise(r => setTimeout(r, 100));
    addForgotPassword();
    await consumeDrinkwiseHandoff();
  }

  init();
})();
