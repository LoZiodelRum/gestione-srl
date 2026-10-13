(() => {
  const cfg = window.GESTIONE_SRL_SUPABASE;
  if (!cfg || !window.supabase?.createClient) return;

  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.gestioneSrlSupabase = sb;

  let sessionUser = null;
  let syncRunning = false;
  let syncQueued = false;
  let hydrated = false;
  let migrationPass = false;
  const originalPersist = persist;
  const originalEditIncome = editIncome;
  const originalEditExpense = editExpense;

  function injectUi() {
    const style = document.createElement('style');
    style.textContent = `
      #srlCloudStatus{position:fixed;top:10px;right:10px;z-index:9997;background:#fff;border:1px solid #d9e1ea;border-radius:999px;padding:7px 11px;font:600 12px system-ui;box-shadow:0 3px 14px rgba(0,0,0,.08);color:#173b6f;display:flex;gap:8px;align-items:center}
      #srlCloudStatus button{border:0;background:transparent;color:#173b6f;font-weight:700;cursor:pointer;padding:0}
      #srlAuthOverlay{position:fixed;inset:0;z-index:9999;background:rgba(10,26,48,.88);display:flex;align-items:center;justify-content:center;padding:20px}
      #srlAuthOverlay.hidden{display:none}
      .srl-auth-card{width:min(430px,100%);background:#fff;border-radius:20px;padding:24px;box-shadow:0 20px 70px rgba(0,0,0,.3)}
      .srl-auth-card h2{margin:0 0 6px;color:#173b6f}.srl-auth-card p{margin:0 0 18px;color:#52657a;font-size:14px}.srl-auth-card label{display:block;font-size:12px;font-weight:800;color:#173b6f;margin:12px 0 5px}.srl-auth-card input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccd6e2;border-radius:10px;font-size:16px}.srl-auth-card button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:#173b6f;color:#fff;font-weight:800;cursor:pointer}.srl-auth-error{min-height:18px;color:#b42318;font-size:13px;margin-top:10px}.cloud-readonly{opacity:.72}.cloud-badge{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:999px;background:#eaf2fb;color:#173b6f;font-size:10px;font-weight:800}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'srlAuthOverlay';
    overlay.innerHTML = `<div class="srl-auth-card"><h2>GESTIONE SRL</h2><p>Accedi con lo stesso account amministrativo DrinkWise.</p><label>EMAIL</label><input id="srlAuthEmail" type="email" autocomplete="username"><label>PASSWORD</label><input id="srlAuthPassword" type="password" autocomplete="current-password"><button id="srlAuthBtn" type="button">ACCEDI</button><div id="srlAuthError" class="srl-auth-error"></div></div>`;
    document.body.appendChild(overlay);

    const statusBox = document.createElement('div');
    statusBox.id = 'srlCloudStatus';
    statusBox.innerHTML = `<span id="srlCloudText">Cloud non connesso</span><button id="srlLogoutBtn" type="button" hidden>Esci</button>`;
    document.body.appendChild(statusBox);

    document.getElementById('srlAuthBtn').onclick = signIn;
    document.getElementById('srlAuthPassword').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
    document.getElementById('srlLogoutBtn').onclick = () => sb.auth.signOut();
  }

  function status(text) {
    const el = document.getElementById('srlCloudText');
    if (el) el.textContent = text;
  }

  async function signIn() {
    const email = document.getElementById('srlAuthEmail').value.trim();
    const password = document.getElementById('srlAuthPassword').value;
    const err = document.getElementById('srlAuthError');
    err.textContent = '';
    const btn = document.getElementById('srlAuthBtn');
    btn.disabled = true;
    btn.textContent = 'ACCESSO...';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = 'ACCEDI';
    if (error) err.textContent = 'Credenziali non valide o account non autorizzato.';
  }

  function ownIncomeRow(i) {
    const c = calcIncome(i);
    return {
      tipo: 'entrata', categoria: i.category || 'Entrata', descrizione: i.description || i.customer || 'Entrata',
      importo: c.gross, data_movimento: i.date || today(), metodo_pagamento: i.paymentMethod || null,
      riferimento: i.docNo || null, imponibile: c.net, aliquota_iva: num(i.vatRate), importo_iva: c.vat,
      totale_pagato: i.paid === 'yes' ? c.gross : 0, stato_pagamento: i.paid === 'yes' ? 'pagato' : 'da_pagare',
      origine: 'gestione_srl', fornitore: i.customer || null, numero_documento: i.docNo || null,
      fiscalmente_rilevante: true, external_reference: `gestione_srl:income:${i.id}`,
      metadata: { app: 'gestione_srl', kind: 'income', payload: i }
    };
  }

  function ownExpenseRow(e) {
    const c = calcExpense(e);
    return {
      tipo: 'uscita', categoria: e.category || expenseTypeLabel(e.type), descrizione: e.description || expenseTypeLabel(e.type),
      importo: c.grossDocument || c.economicCost, data_movimento: e.date || today(), metodo_pagamento: e.paymentMethod || null,
      riferimento: e.docNo || null, imponibile: c.economicCost, aliquota_iva: num(e.vatRate), importo_iva: c.vat,
      totale_pagato: e.paid === 'yes' ? c.cash : 0, stato_pagamento: e.paid === 'yes' ? 'pagato' : 'da_pagare',
      origine: 'gestione_srl', fornitore: e.supplier || null, numero_documento: e.docNo || null,
      deducibile_pct: clampPct(e.iresDeduct ?? 100), iva_detraibile_pct: clampPct(e.vatDeduct ?? 0),
      fiscalmente_rilevante: true, external_reference: `gestione_srl:expense:${e.id}`,
      metadata: { app: 'gestione_srl', kind: 'expense', payload: e, irap_deductible_pct: clampPct(e.irapDeduct ?? 100) }
    };
  }

  function ownTaxRow(t) {
    return {
      tipo: 'uscita', categoria: 'Versamento imposte', descrizione: t.note || `Versamento ${t.type}`,
      importo: num(t.amount), data_movimento: t.date || today(), metodo_pagamento: 'F24',
      imponibile: num(t.amount), aliquota_iva: 0, importo_iva: 0, totale_pagato: num(t.amount),
      stato_pagamento: 'pagato', origine: 'gestione_srl', fiscalmente_rilevante: false,
      external_reference: `gestione_srl:tax:${t.id}`,
      metadata: { app: 'gestione_srl', kind: 'taxPayment', payload: t }
    };
  }

  function cloudIncomeFromRow(r) {
    if (r.origine === 'gestione_srl' && r.metadata?.kind === 'income' && r.metadata?.payload) return { ...r.metadata.payload, _cloudRowId: r.id };
    const net = num(r.imponibile ?? r.importo);
    return {
      id: `cloud-${r.id}`, date: r.data_competenza || r.data_movimento || today(), amount: net,
      vatRate: num(r.aliquota_iva), customer: r.fornitore || r.metadata?.customer_name || '', docNo: r.numero_documento || r.riferimento || '',
      category: r.categoria || 'Entrata DrinkWise', description: r.descrizione || '', paid: String(r.stato_pagamento || '').toLowerCase() === 'da_pagare' ? 'no' : 'yes',
      paymentMethod: r.metodo_pagamento || 'Altro', _cloudReadOnly: r.origine !== 'gestione_srl', _cloudOrigin: r.origine || 'DrinkWise', _cloudRowId: r.id
    };
  }

  function cloudExpenseFromRow(r) {
    if (r.origine === 'gestione_srl' && r.metadata?.kind === 'expense' && r.metadata?.payload) return { ...r.metadata.payload, _cloudRowId: r.id };
    return null;
  }

  function cloudTaxFromRow(r) {
    if (r.origine === 'gestione_srl' && r.metadata?.kind === 'taxPayment' && r.metadata?.payload) return { ...r.metadata.payload, _cloudRowId: r.id };
    return null;
  }

  async function loadCloud() {
    status('Sincronizzazione...');
    const [{ data: rows, error: rowsError }, { data: remoteSettings, error: settingsError }] = await Promise.all([
      sb.from('movimenti_finanziari').select('*').order('data_movimento', { ascending: false }),
      sb.from('gestione_srl_settings').select('settings').eq('id', 'default').maybeSingle()
    ]);
    if (rowsError) throw rowsError;
    if (settingsError) throw settingsError;

    const ownRows = (rows || []).filter(r => r.origine === 'gestione_srl');
    const ownIncome = ownRows.map(cloudIncomeFromRow).filter(Boolean);
    const ownExpense = ownRows.map(cloudExpenseFromRow).filter(Boolean);
    const ownTax = ownRows.map(cloudTaxFromRow).filter(Boolean);
    const externalIncome = (rows || []).filter(r => r.tipo === 'entrata' && r.origine !== 'gestione_srl' && r.fiscalmente_rilevante !== false).map(cloudIncomeFromRow);

    const localOwnCount = incomes.filter(x => !x._cloudReadOnly).length + expenses.filter(x => !x._cloudReadOnly).length + taxPayments.length;
    if (!migrationPass && ownRows.length === 0 && localOwnCount > 0) {
      migrationPass = true;
      await pushCloud();
      return loadCloud();
    }

    incomes = [...ownIncome, ...externalIncome];
    expenses = ownExpense;
    taxPayments = ownTax;
    if (remoteSettings?.settings && Object.keys(remoteSettings.settings).length) settings = Object.assign({}, DEFAULT_SETTINGS, remoteSettings.settings);
    originalPersist();
    loadSettings(); fillYears(); renderAll(); autoFillTaxPayment();
    hydrated = true;
    markReadOnly();
    status('Cloud sincronizzato');
  }

  async function pushCloud() {
    if (!sessionUser) return;
    const ownIncomes = incomes.filter(x => !x._cloudReadOnly);
    const ownExpenses = expenses.filter(x => !x._cloudReadOnly);
    const desired = [...ownIncomes.map(ownIncomeRow), ...ownExpenses.map(ownExpenseRow), ...taxPayments.map(ownTaxRow)];

    const { data: existing, error: readError } = await sb.from('movimenti_finanziari').select('id,external_reference').eq('origine', 'gestione_srl');
    if (readError) throw readError;
    const byRef = new Map((existing || []).map(x => [x.external_reference, x]));

    for (const row of desired) {
      const found = byRef.get(row.external_reference);
      if (found?.id) {
        const { error } = await sb.from('movimenti_finanziari').update(row).eq('id', found.id).eq('origine', 'gestione_srl');
        if (error) throw error;
      } else {
        const { error } = await sb.from('movimenti_finanziari').insert(row);
        if (error) throw error;
      }
    }

    const wanted = new Set(desired.map(x => x.external_reference));
    const staleIds = (existing || []).filter(x => x.external_reference && !wanted.has(x.external_reference)).map(x => x.id);
    if (staleIds.length) {
      const { error } = await sb.from('movimenti_finanziari').delete().in('id', staleIds).eq('origine', 'gestione_srl');
      if (error) throw error;
    }

    const { error: settingsError } = await sb.from('gestione_srl_settings').upsert({ id: 'default', settings, updated_by: sessionUser.id, updated_at: new Date().toISOString() });
    if (settingsError) throw settingsError;
  }

  async function syncNow() {
    if (!sessionUser || !hydrated) return;
    if (syncRunning) { syncQueued = true; return; }
    syncRunning = true;
    status('Salvataggio cloud...');
    try {
      await pushCloud();
      status('Cloud sincronizzato');
    } catch (e) {
      console.error('Gestione SRL cloud sync:', e);
      status('Errore sincronizzazione');
    } finally {
      syncRunning = false;
      if (syncQueued) { syncQueued = false; syncNow(); }
    }
  }

  persist = function() {
    originalPersist();
    syncNow();
  };

  editIncome = function(id) {
    const x = incomes.find(v => String(v.id) === String(id));
    if (x?._cloudReadOnly) { alert('Questa entrata arriva da DrinkWise ed è in sola lettura. Modificala dalla fonte originaria.'); return; }
    return originalEditIncome(id);
  };

  editExpense = function(id) {
    const x = expenses.find(v => String(v.id) === String(id));
    if (x?._cloudReadOnly) { alert('Questa uscita arriva da una fonte esterna ed è in sola lettura.'); return; }
    return originalEditExpense(id);
  };

  function markReadOnly() {
    incomes.filter(x => x._cloudReadOnly).forEach(x => {
      const id = String(x.id).replace(/"/g, '\\"');
      const edit = document.querySelector(`[data-edit-income="${id}"]`);
      const del = document.querySelector(`[data-del-income="${id}"]`);
      [edit, del].forEach(b => { if (b) { b.disabled = true; b.title = 'Dato sincronizzato da DrinkWise'; } });
      const article = edit?.closest('.invoice-item') || del?.closest('.invoice-item');
      if (article) {
        article.classList.add('cloud-readonly');
        if (!article.querySelector('.cloud-badge')) article.querySelector('.invoice-desc')?.insertAdjacentHTML('beforeend', `<span class="cloud-badge">${safe(x._cloudOrigin || 'DrinkWise')}</span>`);
      }
    });
  }

  const observer = new MutationObserver(() => markReadOnly());
  observer.observe(document.body, { childList: true, subtree: true });

  function hardenClearButtons() {
    const ci = document.getElementById('clearIncomeBtn');
    if (ci) ci.onclick = () => {
      if (!confirm('Cancellare tutte le entrate inserite da Gestione SRL? Le entrate provenienti da DrinkWise resteranno disponibili.')) return;
      incomes = incomes.filter(x => x._cloudReadOnly); persist(); fillYears(); renderAll();
    };
    const ce = document.getElementById('clearExpenseBtn');
    if (ce) ce.onclick = () => {
      if (!confirm('Cancellare tutte le uscite inserite da Gestione SRL?')) return;
      expenses = expenses.filter(x => x._cloudReadOnly); persist(); fillYears(); renderAll();
    };
  }

  async function handleSession(session) {
    sessionUser = session?.user || null;
    const overlay = document.getElementById('srlAuthOverlay');
    const logout = document.getElementById('srlLogoutBtn');
    if (!sessionUser) {
      hydrated = false;
      migrationPass = false;
      overlay?.classList.remove('hidden');
      if (logout) logout.hidden = true;
      status('Accesso richiesto');
      return;
    }
    overlay?.classList.add('hidden');
    if (logout) logout.hidden = false;
    try {
      const { data: roles, error } = await sb.from('user_roles').select('role').eq('user_id', sessionUser.id);
      if (error) throw error;
      const allowed = (roles || []).some(r => ['admin', 'accountant'].includes(r.role));
      if (!allowed) {
        await sb.auth.signOut();
        document.getElementById('srlAuthError').textContent = 'Questo account non ha ruolo Admin o Accountant.';
        return;
      }
      hardenClearButtons();
      await loadCloud();
    } catch (e) {
      console.error(e);
      status('Errore cloud');
      document.getElementById('srlAuthError').textContent = 'Accesso riuscito, ma non è stato possibile caricare i dati cloud.';
      overlay?.classList.remove('hidden');
    }
  }

  injectUi();
  sb.auth.getSession().then(({ data }) => handleSession(data.session));
  sb.auth.onAuthStateChange((_event, session) => handleSession(session));
})();
