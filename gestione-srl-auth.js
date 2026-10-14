(() => {
  const DRINKWISE_REDEEM_URL = 'https://drinkwise.it/api/public/gestione-srl-redeem';
  const RESET_URL = 'https://drinkwise.it/reset-password';
  const TAB_AUTH_KEY = 'gestione_srl_tab_authorized';

  function getSb() { return window.gestioneSrlSupabase || null; }
  function authErrorEl() { return document.getElementById('srlAuthError'); }
  function overlayEl() { return document.getElementById('srlAuthOverlay'); }

  function setMessage(message, isError = false) {
    const el = authErrorEl();
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#b42318' : '#365a86';
  }

  function decorateReservedLogin() {
    const overlay = overlayEl();
    if (!overlay) return;
    const card = overlay.querySelector('.srl-auth-card');
    if (!card || card.dataset.reservedDecorated === '1') return;
    card.dataset.reservedDecorated = '1';

    const title = card.querySelector('h2');
    if (title) title.textContent = 'GESTIONE SRL';
    const intro = card.querySelector('p');
    if (intro) intro.textContent = 'Accesso riservato agli utenti autorizzati da DrinkWise.';

    const notice = document.createElement('div');
    notice.style.margin = '0 0 16px';
    notice.style.padding = '10px 12px';
    notice.style.borderRadius = '10px';
    notice.style.background = '#f3f6fa';
    notice.style.color = '#44586f';
    notice.style.fontSize = '12px';
    notice.style.lineHeight = '1.45';
    notice.innerHTML = '<strong>Area protetta</strong><br>Nessuna registrazione libera. L\'accesso viene autorizzato esclusivamente dall\'Amministratore DrinkWise.';
    intro?.insertAdjacentElement('afterend', notice);
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
      setMessage('Se l’indirizzo è autorizzato, riceverai il link per reimpostare la password.');
    };
    err.insertAdjacentElement('beforebegin', btn);
  }

  async function consumeDrinkwiseHandoff(token) {
    const sb = getSb();
    if (!sb || !token || !/^[a-f0-9]{64}$/.test(token)) return false;

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
      sessionStorage.setItem(TAB_AUTH_KEY, 'handoff');
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
    const sb = getSb();
    if (!sb) return;
    for (let i = 0; i < 50 && !overlayEl(); i++) await new Promise(r => setTimeout(r, 100));

    decorateReservedLogin();
    addForgotPassword();

    const params = new URLSearchParams(location.search);
    const handoff = params.get('handoff');

    if (handoff && /^[a-f0-9]{64}$/.test(handoff)) {
      await consumeDrinkwiseHandoff(handoff);
    } else {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) {
        sessionStorage.setItem(TAB_AUTH_KEY, sessionStorage.getItem(TAB_AUTH_KEY) || 'existing');
        overlayEl()?.classList.add('hidden');
        setMessage('');
      } else {
        overlayEl()?.classList.remove('hidden');
        setMessage('Inserisci le credenziali dell’account autorizzato.');
      }
    }

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        if (!sessionStorage.getItem(TAB_AUTH_KEY)) sessionStorage.setItem(TAB_AUTH_KEY, 'direct');
        overlayEl()?.classList.add('hidden');
        setMessage('');
      }
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem(TAB_AUTH_KEY);
        overlayEl()?.classList.remove('hidden');
      }
    });
  }

  init();
})();