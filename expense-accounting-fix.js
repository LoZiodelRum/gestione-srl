(() => {
  if (typeof calcExpense !== 'function' || typeof renderExpense !== 'function') return;

  calcExpense = function(e) {
    if (e.type === 'salary' || e.type === 'administrator') {
      const gross = num(e.payrollGross), net = num(e.payrollNet), irpef = num(e.payrollIrpef), empSocial = num(e.payrollEmployeeSocial), employerSocial = num(e.payrollEmployerSocial), tfr = num(e.payrollTfr), otherCost = num(e.payrollOtherCost), otherDue = num(e.payrollOtherDue);
      const economicCost = gross + employerSocial + tfr + otherCost;
      const withholding = irpef;
      const social = empSocial + employerSocial + otherDue;
      const cash = e.paid === 'yes' ? net : 0;
      return { economicCost, taxableBase:economicCost, vat:0, vatDeduct:0, nonDeductibleVat:0, cash, payable:net, withholding, social, iresDeduct:economicCost, irapDeduct:economicCost, grossDocument:economicCost };
    }

    const base = num(e.amount);
    const pension = base * num(e.pensionRate) / 100;
    const vatBase = base + pension;
    const vat = vatBase * num(e.vatRate) / 100;
    const withholding = base * num(e.withholdingRate) / 100;
    const grossDocument = vatBase + vat;
    const supplierPay = grossDocument - withholding;
    const vatIsDeductible = e.vatDeductible === undefined ? clampPct(e.vatDeduct) > 0 : e.vatDeductible !== 'no';
    const vatDeduct = vatIsDeductible ? vat * clampPct(e.vatDeduct) / 100 : 0;
    const nonDeductibleVat = Math.max(0, vat - vatDeduct);
    const economicCost = base + pension + nonDeductibleVat;
    const cash = e.paid === 'yes' ? supplierPay : 0;

    return {
      economicCost, taxableBase:vatBase, vat, vatDeduct, nonDeductibleVat, cash, payable:supplierPay, withholding, social:0,
      iresDeduct:economicCost * clampPct(e.iresDeduct) / 100,
      irapDeduct:economicCost * clampPct(e.irapDeduct) / 100,
      grossDocument
    };
  };

  function displayExpenseAmount(x, c) {
    if (x.type === 'salary' || x.type === 'administrator') return x.paid === 'yes' ? c.cash : num(x.payrollNet);
    return x.paid === 'yes' ? c.cash : c.payable;
  }

  renderExpense = function() {
    const y = Number($('expenseYearFilter').value) || curYear();
    const q = $('expenseSearch').value.trim().toLowerCase();
    const list = expenses.filter(x => ymdYear(x.date) === y && [x.supplier,x.docNo,x.category,x.description,expenseTypeLabel(x.type)].join(' ').toLowerCase().includes(q));
    const cc = list.map(calcExpense);

    $('expenseTotalCost').textContent = money(sum(cc,x=>x.economicCost));
    $('expenseTotalVat').textContent = money(sum(cc,x=>x.vat));
    $('expenseTotalVatDeduct').textContent = money(sum(cc,x=>x.vatDeduct));
    $('expenseTotalCash').textContent = money(sum(cc,x=>x.cash));
    $('expenseTotalWithholding').textContent = money(sum(cc,x=>x.withholding));
    $('expenseTotalSocial').textContent = money(sum(cc,x=>x.social));

    const groups = new Map();
    list.forEach(x => {
      const k = expenseTypeLabel(x.type), c = calcExpense(x), g = groups.get(k) || {n:0,cost:0,vat:0,cash:0};
      g.n++; g.cost += c.economicCost; g.vat += c.vatDeduct; g.cash += c.cash; groups.set(k,g);
    });
    $('expenseBreakdownBody').innerHTML = [...groups.entries()].sort((a,b)=>b[1].cost-a[1].cost).map(([k,g])=>`<tr><td>${safe(k)}</td><td>${g.n}</td><td>${money(g.cost)}</td><td>${money(g.vat)}</td><td>${money(g.cash)}</td></tr>`).join('') || '<tr><td colspan="5">Nessun dato</td></tr>';

    $('expenseList').innerHTML = list.map(x => {
      const c = calcExpense(x);
      const shown = displayExpenseAmount(x,c);
      const status = x.paid === 'yes' ? 'Pagata' : 'Da pagare';
      const detail = (x.type === 'salary' || x.type === 'administrator')
        ? `Costo economico: ${money(c.economicCost)} · Netto: ${money(num(x.payrollNet))} · Ritenute: ${money(c.withholding)} · Contributi INPS/oneri: ${money(c.social)}`
        : `Imponibile/costo base: ${money(c.taxableBase)} · IVA: ${money(c.vat)} · IVA detraibile: ${c.vatDeduct>0?money(c.vatDeduct)+' ('+clampPct(x.vatDeduct)+'%)':'No'}${c.nonDeductibleVat>0?' · IVA non detraibile nel costo: '+money(c.nonDeductibleVat):''} · Costo economico: ${money(c.economicCost)} · Totale documento: ${money(c.grossDocument)} · ${x.paid==='yes'?'Uscita effettiva':'Da pagare al fornitore'}: ${money(shown)} · Ritenuta: ${money(c.withholding)}`;
      return `<article class="invoice-item expense"><div class="invoice-top"><strong>${money(shown)}</strong><span>${safe(x.date)}</span></div><div class="invoice-desc">${safe(x.supplier||'Percettore non indicato')} · ${safe(expenseTypeLabel(x.type))}</div><div class="invoice-meta">${detail} · ${status}${x.docNo?' · Doc. '+safe(x.docNo):''}</div><div class="invoice-actions"><button data-edit-expense="${x.id}">Modifica</button><button data-del-expense="${x.id}">Elimina</button></div></article>`;
    }).join('');

    $('expenseEmpty').classList.toggle('hidden', list.length > 0);
    document.querySelectorAll('[data-edit-expense]').forEach(b => b.onclick = () => editExpense(b.dataset.editExpense));
    document.querySelectorAll('[data-del-expense]').forEach(b => b.onclick = () => {
      if (confirm('Eliminare questa uscita?')) {
        expenses = expenses.filter(x => x.id !== b.dataset.delExpense);
        persist(); fillYears(); renderAll();
      }
    });
  };

  function enforceExpenseCards() {
    document.querySelectorAll('#expenseList .invoice-item.expense').forEach(card => {
      const btn = card.querySelector('[data-del-expense]') || card.querySelector('[data-edit-expense]');
      const id = btn?.dataset.delExpense || btn?.dataset.editExpense;
      if (!id) return;
      const x = expenses.find(v => String(v.id) === String(id));
      if (!x) return;
      const c = calcExpense(x);
      const shown = displayExpenseAmount(x,c);
      const strong = card.querySelector('.invoice-top strong');
      if (strong) strong.textContent = money(shown);
      const meta = card.querySelector('.invoice-meta');
      if (meta && x.type !== 'salary' && x.type !== 'administrator') {
        meta.textContent = `Imponibile/costo base: ${money(c.taxableBase)} · IVA: ${money(c.vat)} · IVA detraibile: ${c.vatDeduct>0?money(c.vatDeduct)+' ('+clampPct(x.vatDeduct)+'%)':'No'}${c.nonDeductibleVat>0?' · IVA non detraibile nel costo: '+money(c.nonDeductibleVat):''} · Costo economico: ${money(c.economicCost)} · Totale documento: ${money(c.grossDocument)} · ${x.paid==='yes'?'Uscita effettiva':'Da pagare al fornitore'}: ${money(shown)} · Ritenuta: ${money(c.withholding)} · ${x.paid==='yes'?'Pagata':'Da pagare'}${x.docNo?' · Doc. '+x.docNo:''}`;
      }
    });
  }

  if ($('expenseYearFilter')) $('expenseYearFilter').onchange = renderExpense;
  if ($('expenseSearch')) $('expenseSearch').oninput = renderExpense;

  const observer = new MutationObserver(() => enforceExpenseCards());
  const listRoot = $('expenseList');
  if (listRoot) observer.observe(listRoot, { childList:true, subtree:true });

  renderAll();
  enforceExpenseCards();
  setTimeout(() => { renderExpense(); enforceExpenseCards(); }, 0);
  setTimeout(() => { renderExpense(); enforceExpenseCards(); }, 500);
})();