const $ = id => document.getElementById(id);
const STORE = { incomes:'srl_v2_incomes', expenses:'srl_v2_expenses', taxPayments:'srl_v2_taxpayments', settings:'srl_v4_settings' };
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DEFAULT_SETTINGS = { iresRate:24, irapRate:3.9, openingCash:0, openingVatCredit:0, iresAdjustments:0, irapAdjustments:0, salaryEmployeeRate:9.19, salaryEmployerRate:30, salaryTfrRate:7.4074, salaryAdditionalRate:2, professionalPensionRate:4, professionalWithholdingRate:20, regionalAdditionalRate:0, municipalAdditionalRate:0, shareCapital:0, legalReserve:0, fiscalYear:new Date().getFullYear(), otherTaxesAccrued:0 };
let incomes = load(STORE.incomes, []), expenses = load(STORE.expenses, []), taxPayments = load(STORE.taxPayments, []), settings = Object.assign({}, DEFAULT_SETTINGS, load(STORE.settings, {}));
let editingIncomeId=null, editingExpenseId=null;

function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function persist(){localStorage.setItem(STORE.incomes,JSON.stringify(incomes));localStorage.setItem(STORE.expenses,JSON.stringify(expenses));localStorage.setItem(STORE.taxPayments,JSON.stringify(taxPayments));localStorage.setItem(STORE.settings,JSON.stringify(settings));}
function num(v){
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  if(v==null) return 0;

  let s=String(v)
    .trim()
    .replace(/\s/g,'')
    .replace(/[€%]/g,'');

  if(!s) return 0;

  const commas=(s.match(/,/g)||[]).length;
  const dots=(s.match(/\./g)||[]).length;
  const lastComma=s.lastIndexOf(',');
  const lastDot=s.lastIndexOf('.');

  // Formato italiano completo: 1.234,56
  if(commas>0 && dots>0 && lastComma>lastDot){
    s=s.replace(/\./g,'').replace(',','.');
  }
  // Formato internazionale completo: 1,234.56
  else if(commas>0 && dots>0 && lastDot>lastComma){
    s=s.replace(/,/g,'');
  }
  // Solo virgola: 33,72 -> 33.72 oppure 5.000,00 già gestito sopra
  else if(commas===1 && dots===0){
    s=s.replace(',','.');
  }
  // Più virgole senza punti: le consideriamo separatori delle migliaia
  else if(commas>1 && dots===0){
    s=s.replace(/,/g,'');
  }
  // Più punti senza virgole: 1.234.567 -> 1234567
  else if(dots>1 && commas===0){
    s=s.replace(/\./g,'');
  }
  // Un solo punto: normalmente è decimale (33.72, 3.9, 7.4074).
  // Se ci sono esattamente 3 cifre dopo il punto, lo trattiamo come migliaia (5.000 -> 5000).
  else if(dots===1 && commas===0){
    const [a,b]=s.split('.');
    if(/^[-+]?\d{1,3}$/.test(a) && /^\d{3}$/.test(b)) s=a+b;
  }

  s=s.replace(/[^0-9+\-.]/g,'');
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}
function clampPct(v){return Math.min(100,Math.max(0,num(v)))}
function money(v){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v)||0)}
function today(){return new Date().toISOString().slice(0,10)}
function curYear(){return new Date().getFullYear()}
function ymdYear(d){return Number(String(d||'').slice(0,4))||0}
function ymdMonth(d){return Number(String(d||'').slice(5,7))||0}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function byPeriod(arr,year,month='all'){return arr.filter(x=>ymdYear(x.date)===Number(year)&&(month==='all'||ymdMonth(x.date)===Number(month)))}
function sum(arr,fn){return arr.reduce((a,x)=>a+(Number(fn(x))||0),0)}
function irpefGrossAnnual(taxable){
  const x=Math.max(0,num(taxable));
  if(x<=28000)return x*0.23;
  if(x<=50000)return 28000*0.23+(x-28000)*0.35;
  return 28000*0.23+22000*0.35+(x-50000)*0.43;
}
function setMoneyInput(id,value){const el=$(id); if(el)el.value=(Math.max(0,Number(value)||0)).toFixed(2).replace('.',',')}

function calcIncome(i){const net=num(i.amount), rate=num(i.vatRate), vat=net*rate/100, gross=net+vat; return {net,vat,gross,cash:i.paid==='yes'?gross:0}}
function calcExpense(e){
  if(e.type==='salary'||e.type==='administrator'){
    const gross=num(e.payrollGross), net=num(e.payrollNet), irpef=num(e.payrollIrpef), empSocial=num(e.payrollEmployeeSocial), employerSocial=num(e.payrollEmployerSocial), tfr=num(e.payrollTfr), otherCost=num(e.payrollOtherCost), otherDue=num(e.payrollOtherDue);
    const economicCost=gross+employerSocial+tfr+otherCost;
    const withholding=irpef;
    const social=empSocial+employerSocial+otherDue;
    const cash=e.paid==='yes'?net:0;
    return {economicCost,vat:0,vatDeduct:0,cash,withholding,social,iresDeduct:economicCost,irapDeduct:economicCost,grossDocument:economicCost};
  }
  const base=num(e.amount), pension=base*num(e.pensionRate)/100, vatBase=base+pension, vat=vatBase*num(e.vatRate)/100, withholding=base*num(e.withholdingRate)/100, grossDocument=vatBase+vat, supplierPay=grossDocument-withholding;
  const vatIsDeductible=e.vatDeductible===undefined ? clampPct(e.vatDeduct)>0 : e.vatDeductible!=='no';
  const vatDeduct=vatIsDeductible ? vat*clampPct(e.vatDeduct)/100 : 0;
  const economicCost=base+pension;
  const cash=e.paid==='yes'?supplierPay:0;
  return {economicCost,vat,vatDeduct,cash,withholding,social:0,iresDeduct:economicCost*clampPct(e.iresDeduct)/100,irapDeduct:economicCost*clampPct(e.irapDeduct)/100,grossDocument};
}
function paymentTotals(year,month='all'){
  const p=byPeriod(taxPayments,year,month); const obj={vat:0,withholding:0,social:0,ires:0,irap:0,other:0,total:0};
  p.forEach(x=>{const a=num(x.amount); if(obj[x.type]!==undefined)obj[x.type]+=a; obj.total+=a}); return obj;
}
function summary(year,month='all'){
  const inc=byPeriod(incomes,year,month), exp=byPeriod(expenses,year,month), pay=paymentTotals(year,month);
  const ic=inc.map(calcIncome), ec=exp.map(calcExpense);
  const revenue=sum(ic,x=>x.net), vatOut=sum(ic,x=>x.vat), customerReceipts=sum(ic,x=>x.cash);
  const costs=sum(ec,x=>x.economicCost), vatIn=sum(ec,x=>x.vatDeduct), cashExpense=sum(ec,x=>x.cash);
  const withholdingGenerated=sum(ec,x=>x.withholding), socialGenerated=sum(ec,x=>x.social);
  const iresDeductibleCosts=sum(ec,x=>x.iresDeduct), irapDeductibleCosts=sum(ec,x=>x.irapDeduct);
  const preTaxProfit=revenue-costs;
  const iresBase=Math.max(0,revenue-iresDeductibleCosts+num(settings.iresAdjustments));
  const irapBase=Math.max(0,revenue-irapDeductibleCosts+num(settings.irapAdjustments));
  const ires=iresBase*num(settings.iresRate)/100, irap=irapBase*num(settings.irapRate)/100;
  const netProfit=preTaxProfit-ires-irap;
  const openingVat=(month==='all'?num(settings.openingVatCredit):0);
  const vatDue=Math.max(0,vatOut-vatIn-openingVat-pay.vat), vatCredit=Math.max(0,vatIn+openingVat+pay.vat-vatOut);
  const withholdingDue=Math.max(0,withholdingGenerated-pay.withholding);
  const socialDue=Math.max(0,socialGenerated-pay.social);
  const iresDue=Math.max(0,ires-pay.ires), irapDue=Math.max(0,irap-pay.irap);
  const cashFlow=customerReceipts-cashExpense-pay.total;
  const openingCash=(month==='all'?num(settings.openingCash):0);
  const cashBalance=openingCash+cashFlow;
  const otherTaxesDue=Math.max(0,num(settings.otherTaxesAccrued)-pay.other);
  const prudentCash=cashBalance-vatDue-withholdingDue-socialDue-iresDue-irapDue-otherTaxesDue;
  return {revenue,vatOut,customerReceipts,costs,vatIn,cashExpense,withholdingGenerated,socialGenerated,iresDeductibleCosts,irapDeductibleCosts,preTaxProfit,iresBase,irapBase,ires,irap,netProfit,vatDue,vatCredit,withholdingDue,socialDue,iresDue,irapDue,otherTaxesDue,payments:pay,cashFlow,cashBalance,prudentCash};
}

function allYears(){const ys=new Set([curYear(),...incomes.map(x=>ymdYear(x.date)),...expenses.map(x=>ymdYear(x.date)),...taxPayments.map(x=>ymdYear(x.date))]);return [...ys].filter(Boolean).sort((a,b)=>b-a)}
function fillYears(){const ys=allYears(); ['dashYear','incomeYearFilter','expenseYearFilter','taxYear'].forEach(id=>{const el=$(id); const old=el.value; el.innerHTML=ys.map(y=>`<option value="${y}">${y}</option>`).join(''); el.value=ys.includes(Number(old))?old:String(curYear())}); if(!$('dashYear').value)$('dashYear').value=String(curYear()); if(!$('taxYear').value)$('taxYear').value=String(curYear())}
function fillMonths(){if($('dashMonth').options.length>1)return; MONTHS.forEach((m,i)=>$('dashMonth').insertAdjacentHTML('beforeend',`<option value="${i+1}">${m}</option>`))}

function setView(name){['dashboard','income','expense','tax','settings'].forEach(v=>{$(v+'View').classList.toggle('active',v===name);$(v+'Tab').classList.toggle('active',v===name)}); if(name==='dashboard')renderDashboard(); if(name==='income')renderIncome(); if(name==='expense')renderExpense(); if(name==='tax')renderTax(); window.scrollTo({top:0,behavior:'smooth'})}

function projectedDashboardSummary(){
  const y=Number($('dashYear').value)||curYear(), m=$('dashMonth').value||'all';
  const base=summary(y,m), amount=num($('dashIncomeAmount').value), rate=num($('dashIncomeVatRate').value), paid=$('dashIncomePaid').value;
  if(amount<=0) return {...base, inputNet:0, inputVat:0, inputGross:0};
  const vat=amount*rate/100, gross=amount+vat;
  const revenue=base.revenue+amount, vatOut=base.vatOut+vat, customerReceipts=base.customerReceipts+(paid==='yes'?gross:0);
  const preTaxProfit=revenue-base.costs;
  const iresBase=Math.max(0,revenue-base.iresDeductibleCosts+num(settings.iresAdjustments));
  const irapBase=Math.max(0,revenue-base.irapDeductibleCosts+num(settings.irapAdjustments));
  const ires=iresBase*num(settings.iresRate)/100, irap=irapBase*num(settings.irapRate)/100, netProfit=preTaxProfit-ires-irap;
  const openingVat=(m==='all'?num(settings.openingVatCredit):0), pay=base.payments;
  const vatDue=Math.max(0,vatOut-base.vatIn-openingVat-pay.vat), vatCredit=Math.max(0,base.vatIn+openingVat+pay.vat-vatOut);
  const cashFlow=customerReceipts-base.cashExpense-pay.total, openingCash=(m==='all'?num(settings.openingCash):0), cashBalance=openingCash+cashFlow;
  const iresDue=Math.max(0,ires-pay.ires), irapDue=Math.max(0,irap-pay.irap), otherTaxesDue=Math.max(0,num(settings.otherTaxesAccrued)-pay.other);
  const prudentCash=cashBalance-vatDue-base.withholdingDue-base.socialDue-iresDue-irapDue-otherTaxesDue;
  return {...base,revenue,vatOut,customerReceipts,preTaxProfit,iresBase,irapBase,ires,irap,netProfit,vatDue,vatCredit,iresDue,irapDue,cashFlow,cashBalance,prudentCash,otherTaxesDue,inputNet:amount,inputVat:vat,inputGross:gross};
}
function setSignedClass(el,value){if(!el)return;el.classList.toggle('negative-value',Number(value)<0);el.classList.toggle('positive-value',Number(value)>0)}
function renderDashboard(){
  const y=Number($('dashYear').value)||curYear(), m=$('dashMonth').value||'all', s=summary(y,m), p=projectedDashboardSummary();
  $('periodLabel').textContent=m==='all'?String(y):`${MONTHS[Number(m)-1]} ${y}`; $('monthlyYearLabel').textContent=String(y);
  $('dashInputVat').textContent=money(p.inputVat); $('dashInputGross').textContent=money(p.inputGross);
  $('dashLiveRevenue').textContent=money(p.inputNet); $('dashLiveVat').textContent=money(p.inputVat); $('dashLiveGross').textContent=money(p.inputGross);
  $('dashLiveCosts').textContent=money(p.costs);
  const periodExpenses=byPeriod(expenses,y,m), adminCost=sum(periodExpenses.filter(x=>x.type==='administrator').map(calcExpense),x=>x.economicCost), payrollCost=sum(periodExpenses.filter(x=>x.type==='salary').map(calcExpense),x=>x.economicCost);
  $('dashLiveAdmin').textContent=money(adminCost); $('dashLivePayroll').textContent=money(payrollCost);
  $('dashLiveSocial').textContent=money(p.socialDue); $('dashLiveWithholdings').textContent=money(p.withholdingDue); $('dashLiveVatDue').textContent=p.vatDue>0?money(p.vatDue):`Credito ${money(p.vatCredit)}`;
  $('dashLivePreTax').textContent=money(p.preTaxProfit); $('dashLiveIres').textContent=money(p.ires); $('dashLiveIrap').textContent=money(p.irap); $('dashLiveNetProfit').textContent=money(p.netProfit);
  const liveTotalDue=p.vatDue+p.withholdingDue+p.socialDue+p.iresDue+p.irapDue+p.otherTaxesDue;
  $('dashLiveTotalDue').textContent=money(liveTotalDue); $('dashLivePrudentCash').textContent=money(p.prudentCash);
  $('dashRevenue').textContent=money(s.revenue); $('dashVatOut').textContent=money(s.vatOut); $('dashCosts').textContent=money(s.costs); $('dashVatIn').textContent=money(s.vatIn); $('dashVatDeductible').textContent=money(s.vatIn); $('dashCashFlow').textContent=money(s.cashFlow); $('dashNetProfit').textContent=money(s.netProfit);
  $('dashCustomerReceipts').textContent=money(s.customerReceipts); $('dashCashOut').textContent=money(s.cashExpense+s.payments.total); $('dashVatBalance').textContent=s.vatDue>0?money(s.vatDue):`Credito ${money(s.vatCredit)}`; $('dashWithholdings').textContent=money(s.withholdingDue); $('dashSocial').textContent=money(s.socialDue); $('dashIresReserve').textContent=money(s.iresDue); $('dashIrapReserve').textContent=money(s.irapDue); $('dashOtherTaxes').textContent=money(s.otherTaxesDue); $('dashCorpTaxes').textContent=money(s.iresDue+s.irapDue); $('dashPrudentCash').textContent=money(s.prudentCash); $('dashFinalNetProfit').textContent=money(s.netProfit);
  setSignedClass($('dashPrudentCash'),s.prudentCash); setSignedClass($('dashFinalNetProfit'),s.netProfit); setSignedClass($('dashLiveNetProfit'),p.netProfit); setSignedClass($('dashLivePrudentCash'),p.prudentCash);
  $('monthlyTableBody').innerHTML=MONTHS.map((name,i)=>{const z=summary(y,i+1);return `<tr><td>${name.slice(0,3)}</td><td>${money(z.revenue)}</td><td>${money(z.costs)}</td><td>${money(z.vatDue)}</td><td>${money(z.cashFlow)}</td><td>${money(z.netProfit)}</td></tr>`}).join('');
}
function saveDashboardIncome(){
  const amount=num($('dashIncomeAmount').value); if(amount<=0){alert('Inserisci un importo imponibile maggiore di zero.');return}
  incomes.unshift({id:uid(),date:$('dashIncomeDate').value||today(),amount,vatRate:num($('dashIncomeVatRate').value),customer:$('dashIncomeCustomer').value.trim(),docNo:$('dashIncomeInvoiceNo').value.trim(),category:$('dashIncomeCategory').value,description:$('dashIncomeDescription').value.trim(),paid:$('dashIncomePaid').value,paymentMethod:$('dashIncomePaymentMethod').value});
  persist(); $('dashIncomeAmount').value=''; $('dashIncomeCustomer').value=''; $('dashIncomeInvoiceNo').value=''; $('dashIncomeDescription').value=''; fillYears(); renderAll(); alert('Entrata registrata.');
}
function incomePreview(){const c=calcIncome({amount:$('incomeAmount').value,vatRate:$('incomeVatRate').value,paid:$('incomePaid').value});$('incomePreviewNet').textContent=money(c.net);$('incomePreviewVat').textContent=money(c.vat);$('incomePreviewGross').textContent=money(c.gross)}
function closeIncomeEdit(){editingIncomeId=null;$('incomeEditPanel').classList.add('hidden');}
function saveIncome(){
  if(!editingIncomeId){closeIncomeEdit();return}
  const amount=num($('incomeAmount').value); if(amount<=0){alert('Inserisci un importo maggiore di zero.');return}
  const item={id:editingIncomeId,date:$('incomeDate').value||today(),amount,vatRate:num($('incomeVatRate').value),customer:$('incomeCustomer').value.trim(),docNo:$('incomeInvoiceNo').value.trim(),category:$('incomeCategory').value.trim(),description:$('incomeDescription').value.trim(),paid:$('incomePaid').value,paymentMethod:$('incomePaymentMethod').value};
  incomes=incomes.map(x=>x.id===editingIncomeId?item:x);
  persist();closeIncomeEdit();fillYears();renderIncome();renderDashboard();renderTax();alert('Entrata aggiornata.');
}
function editIncome(id){
  const x=incomes.find(v=>v.id===id);if(!x)return;editingIncomeId=id;
  $('incomeAmount').value=String(x.amount).replace('.',',');$('incomeVatRate').value=String(x.vatRate);$('incomeCustomer').value=x.customer||'';$('incomeInvoiceNo').value=x.docNo||'';$('incomeCategory').value=x.category||'Servizi';$('incomeDescription').value=x.description||'';$('incomeDate').value=x.date||today();$('incomePaid').value=x.paid||'yes';$('incomePaymentMethod').value=x.paymentMethod||'Bonifico';
  $('incomeEditPanel').classList.remove('hidden');incomePreview();setView('income');$('incomeEditPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderIncome(){
  const y=Number($('incomeYearFilter').value)||curYear(), m=$('incomeMonthFilter').value, status=$('incomeStatusFilter').value, cat=$('incomeCategoryFilter').value, q=$('incomeSearch').value.trim().toLowerCase();
  const list=incomes.filter(x=>ymdYear(x.date)===y&&(m==='all'||ymdMonth(x.date)===Number(m))&&(status==='all'||x.paid===status)&&(cat==='all'||x.category===cat)&&[x.customer,x.docNo,x.category,x.description].join(' ').toLowerCase().includes(q));
  const cc=list.map(calcIncome);
  const gross=sum(cc,x=>x.gross), paid=sum(cc,x=>x.cash);
  $('incomeTotalNet').textContent=money(sum(cc,x=>x.net));$('incomeTotalVat').textContent=money(sum(cc,x=>x.vat));$('incomeTotalGross').textContent=money(gross);$('incomeTotalPaid').textContent=money(paid);$('incomeTotalUnpaid').textContent=money(Math.max(0,gross-paid));$('incomeDocumentCount').textContent=String(list.length);
  $('incomeList').innerHTML=list.map(x=>{const c=calcIncome(x);return `<article class="invoice-item"><div class="invoice-top"><strong>${money(c.gross)}</strong><span>${safe(x.date)}</span></div><div class="invoice-desc">${safe(x.customer||'Cliente non indicato')} · ${safe(x.description||x.category||'Entrata')}</div><div class="invoice-meta">Imponibile ${money(c.net)} · IVA ${money(c.vat)} · ${x.paid==='yes'?'Incassata':'Da incassare'} · ${safe(x.paymentMethod||'Metodo non indicato')} ${x.docNo?'· Doc. '+safe(x.docNo):''}</div><div class="invoice-actions"><button data-edit-income="${x.id}">Modifica</button><button data-del-income="${x.id}">Elimina</button></div></article>`}).join('');
  $('incomeEmpty').classList.toggle('hidden',list.length>0);
  document.querySelectorAll('[data-edit-income]').forEach(b=>b.onclick=()=>editIncome(b.dataset.editIncome));
  document.querySelectorAll('[data-del-income]').forEach(b=>b.onclick=()=>{if(confirm('Eliminare questa entrata?')){incomes=incomes.filter(x=>x.id!==b.dataset.delIncome);persist();fillYears();renderIncome();renderDashboard();renderTax()}});
}

const standardTypes=new Set(['supplier','professional','rent','asset','bank','insurance','taxcost','reimbursement','other']);
function expensePreset(t){
  return {
    supplier:{vat:22,vatDeduct:100,ires:100,irap:100,pension:0,withholding:0,method:'Bonifico'},
    professional:{vat:22,vatDeduct:100,ires:100,irap:100,pension:num(settings.professionalPensionRate),withholding:num(settings.professionalWithholdingRate),method:'Bonifico'},
    rent:{vat:0,vatDeduct:0,ires:100,irap:100,pension:0,withholding:0,method:'Bonifico'},
    asset:{vat:22,vatDeduct:100,ires:100,irap:100,pension:0,withholding:0,method:'Bonifico'},
    bank:{vat:0,vatDeduct:0,ires:100,irap:100,pension:0,withholding:0,method:'Addebito SEPA'},
    insurance:{vat:0,vatDeduct:0,ires:100,irap:100,pension:0,withholding:0,method:'Addebito SEPA'},
    taxcost:{vat:0,vatDeduct:0,ires:0,irap:0,pension:0,withholding:0,method:'F24'},
    reimbursement:{vat:0,vatDeduct:0,ires:100,irap:100,pension:0,withholding:0,method:'Bonifico'},
    other:{vat:22,vatDeduct:100,ires:100,irap:100,pension:0,withholding:0,method:'Bonifico'}
  }[t];
}
function applyExpensePreset(){
  const t=$('expenseType').value,p=expensePreset(t); if(!p)return;
  $('expenseVatRate').value=String(p.vat);$('expenseVatDeductible').value=(p.vat>0&&p.vatDeduct>0)?'yes':'no';$('expenseVatDeduct').value=p.vatDeduct;syncExpenseVatDeductibility(false);$('expenseIresDeduct').value=p.ires;$('expenseIrapDeduct').value=p.irap;$('expensePensionRate').value=p.pension;$('expenseWithholdingRate').value=p.withholding;$('expensePaymentMethod').value=p.method;
}
function syncExpenseVatDeductibility(refresh=true){
  const hasVat=num($('expenseVatRate').value)>0;
  if(!hasVat)$('expenseVatDeductible').value='no';
  const enabled=hasVat&&$('expenseVatDeductible').value==='yes';
  $('expenseVatDeduct').disabled=!enabled;
  if(!enabled)$('expenseVatDeduct').value='0';
  else if(num($('expenseVatDeduct').value)<=0)$('expenseVatDeduct').value='100';
  if(refresh)expensePreview();
}
function syncExpenseType(){
  const t=$('expenseType').value, payroll=t==='salary'||t==='administrator', admin=t==='administrator', salary=t==='salary';
  $('standardExpenseForm').classList.toggle('hidden',payroll);$('payrollExpenseForm').classList.toggle('hidden',!payroll);$('professionalExtras').classList.toggle('hidden',t!=='professional');$('administratorAutoBox').classList.toggle('hidden',!admin);$('salaryAutoBox').classList.toggle('hidden',!salary);
  if(!payroll)applyExpensePreset();
  const cats={supplier:'Fornitori',professional:'Consulenze professionali',salary:'Personale dipendente',administrator:'Compenso amministratore',rent:'Affitto / locazione',asset:'Bene strumentale',bank:'Banche / commissioni',insurance:'Assicurazioni',taxcost:'Imposte e tributi',reimbursement:'Rimborsi spese',other:'Altro costo'}; $('expenseCategory').value=cats[t]||'';
  if(payroll){$('payrollIntro').textContent=admin?'Il compenso amministratore non ha IVA. Inserisci il NETTO PAGATO: l’app ricostruisce automaticamente lordo stimato, contributi, ritenute fiscali, costo aziendale e debiti da versare in base al profilo scelto.':'Lo stipendio non ha IVA. Inserisci il lordo: l’app compila automaticamente una stima di contributi, IRPEF, netto, TFR e costo aziendale; i parametri restano modificabili.';$('payrollTfrLabel').textContent=admin?'TFM / ACCANTONAMENTO':'TFR / ACCANTONAMENTO';$('expensePaymentMethod').value='Bonifico';}
  if(admin){$('payrollNet').readOnly=false;$('payrollGross').readOnly=true;}else if(salary){$('payrollGross').readOnly=false;$('payrollNet').readOnly=true;}
  ['payrollIrpef','payrollEmployeeSocial','payrollEmployerSocial','payrollTfr'].forEach(id=>$(id).readOnly=payroll);
  if(admin)autoFillAdministrator(); else if(salary)syncSalaryDefaults();
  expensePreview(); payrollPreview();
}
function syncAdminContributionProfile(){const v=$('adminContributionProfile').value;if(v!=='custom')$('adminSocialRate').value=v;$('adminSocialRate').readOnly=v!=='custom';autoFillAdministrator()}
function adminCalcFromGross(gross){
  gross=Math.max(0,num(gross));
  const totalRate=clampPct($('adminSocialRate').value), addRate=clampPct($('adminAdditionalRate').value), tfmRate=clampPct($('adminTfmRate').value), freq=$('adminFrequency').value;
  const totalSocial=gross*totalRate/100;
  const employeeSocial=totalSocial/3;
  const employerSocial=totalSocial*2/3;
  const taxableCurrent=Math.max(0,gross-employeeSocial);
  const annualTaxable=freq==='monthly'?taxableCurrent*12:taxableCurrent;
  const annualIrpef=irpefGrossAnnual(annualTaxable);
  const currentIrpef=freq==='monthly'?annualIrpef/12:annualIrpef;
  const additions=taxableCurrent*addRate/100;
  const withholding=Math.max(0,currentIrpef+additions);
  const net=Math.max(0,gross-employeeSocial-withholding);
  const tfm=gross*tfmRate/100;
  return {gross,totalSocial,employeeSocial,employerSocial,taxableCurrent,annualTaxable,withholding,net,tfm};
}
function solveAdminGrossFromNet(targetNet){
  targetNet=Math.max(0,num(targetNet));
  if(targetNet<=0)return adminCalcFromGross(0);
  let low=targetNet, high=Math.max(targetNet*2,1000);
  for(let i=0;i<40 && adminCalcFromGross(high).net<targetNet;i++) high*=1.5;
  for(let i=0;i<80;i++){
    const mid=(low+high)/2, c=adminCalcFromGross(mid);
    if(c.net<targetNet) low=mid; else high=mid;
  }
  return adminCalcFromGross((low+high)/2);
}
function autoFillAdministrator(){
  if($('expenseType').value!=='administrator')return;
  const targetNet=num($('payrollNet').value);
  const c=solveAdminGrossFromNet(targetNet);
  setMoneyInput('payrollGross',c.gross);
  setMoneyInput('payrollEmployeeSocial',c.employeeSocial);
  setMoneyInput('payrollEmployerSocial',c.employerSocial);
  setMoneyInput('payrollIrpef',c.withholding);
  setMoneyInput('payrollTfr',c.tfm);
  $('adminAnnualProjection').textContent=money(c.annualTaxable);
  payrollPreview();
}
function syncSalaryDefaults(){
  $('salaryEmployeeRate').value=num(settings.salaryEmployeeRate);$('salaryEmployerRate').value=num(settings.salaryEmployerRate);$('salaryTfrRate').value=num(settings.salaryTfrRate);$('salaryAdditionalRate').value=num(settings.salaryAdditionalRate);autoFillSalary();
}
function autoFillSalary(){
  if($('expenseType').value!=='salary')return;
  const gross=num($('payrollGross').value), empRate=clampPct($('salaryEmployeeRate').value), employerRate=clampPct($('salaryEmployerRate').value), tfrRate=clampPct($('salaryTfrRate').value), addRate=clampPct($('salaryAdditionalRate').value), freq=$('salaryFrequency').value;
  const employeeSocial=gross*empRate/100, employerSocial=gross*employerRate/100, taxableCurrent=Math.max(0,gross-employeeSocial), annualTaxable=freq==='monthly'?taxableCurrent*12:taxableCurrent;
  const annualIrpef=irpefGrossAnnual(annualTaxable), currentIrpef=freq==='monthly'?annualIrpef/12:annualIrpef, additions=taxableCurrent*addRate/100, withholding=Math.max(0,currentIrpef+additions), net=Math.max(0,gross-employeeSocial-withholding), tfr=gross*tfrRate/100;
  setMoneyInput('payrollEmployeeSocial',employeeSocial);setMoneyInput('payrollEmployerSocial',employerSocial);setMoneyInput('payrollIrpef',withholding);setMoneyInput('payrollNet',net);setMoneyInput('payrollTfr',tfr);$('salaryAnnualProjection').textContent=money(annualTaxable);payrollPreview();
}
function expensePreview(){const e={type:$('expenseType').value,amount:$('expenseAmount').value,vatRate:$('expenseVatRate').value,vatDeductible:$('expenseVatDeductible').value,vatDeduct:$('expenseVatDeduct').value,iresDeduct:$('expenseIresDeduct').value,irapDeduct:$('expenseIrapDeduct').value,pensionRate:$('expensePensionRate').value,withholdingRate:$('expenseWithholdingRate').value,paid:$('expensePaid').value}; const c=calcExpense(e);$('expensePreviewVat').textContent=money(c.vat);$('expensePreviewVatDeduct').textContent=money(c.vatDeduct);$('expensePreviewWithholding').textContent=money(c.withholding);$('expensePreviewCash').textContent=money(c.cash)}
function payrollPreview(){const e={type:$('expenseType').value,payrollGross:$('payrollGross').value,payrollNet:$('payrollNet').value,payrollIrpef:$('payrollIrpef').value,payrollEmployeeSocial:$('payrollEmployeeSocial').value,payrollEmployerSocial:$('payrollEmployerSocial').value,payrollTfr:$('payrollTfr').value,payrollOtherCost:$('payrollOtherCost').value,payrollOtherDue:$('payrollOtherDue').value,paid:$('expensePaid').value};const c=calcExpense(e);$('payrollPreviewCost').textContent=money(c.economicCost);$('payrollPreviewCash').textContent=money(c.cash);$('payrollPreviewDue').textContent=money(c.withholding+c.social)}
function saveExpense(){const t=$('expenseType').value,payroll=t==='salary'||t==='administrator'; if(t==='administrator'&&num($('payrollNet').value)<=0){alert('Inserisci il compenso netto pagato.');return} if(t==='salary'&&num($('payrollGross').value)<=0){alert('Inserisci la retribuzione lorda.');return} if(!payroll&&num($('expenseAmount').value)<=0){alert('Inserisci un importo maggiore di zero.');return}
  const e={id:editingExpenseId||uid(),type:t,date:$('expenseDate').value||today(),supplier:$('expenseSupplier').value.trim(),docNo:$('expenseDocNo').value.trim(),category:$('expenseCategory').value.trim(),description:$('expenseDescription').value.trim(),paid:$('expensePaid').value,paymentMethod:$('expensePaymentMethod').value,amount:num($('expenseAmount').value),vatRate:num($('expenseVatRate').value),vatDeductible:$('expenseVatDeductible').value,vatDeduct:clampPct($('expenseVatDeduct').value),iresDeduct:clampPct($('expenseIresDeduct').value),irapDeduct:clampPct($('expenseIrapDeduct').value),pensionRate:num($('expensePensionRate').value),withholdingRate:num($('expenseWithholdingRate').value),payrollGross:num($('payrollGross').value),payrollNet:num($('payrollNet').value),payrollIrpef:num($('payrollIrpef').value),payrollEmployeeSocial:num($('payrollEmployeeSocial').value),payrollEmployerSocial:num($('payrollEmployerSocial').value),payrollTfr:num($('payrollTfr').value),payrollOtherCost:num($('payrollOtherCost').value),payrollOtherDue:num($('payrollOtherDue').value),adminContributionProfile:$('adminContributionProfile').value,adminSocialRate:num($('adminSocialRate').value),adminFrequency:$('adminFrequency').value,adminAdditionalRate:num($('adminAdditionalRate').value),adminTfmRate:num($('adminTfmRate').value),salaryFrequency:$('salaryFrequency').value,salaryEmployeeRate:num($('salaryEmployeeRate').value),salaryEmployerRate:num($('salaryEmployerRate').value),salaryTfrRate:num($('salaryTfrRate').value),salaryAdditionalRate:num($('salaryAdditionalRate').value)};
  const wasEdit=Boolean(editingExpenseId); if(editingExpenseId){expenses=expenses.map(x=>x.id===editingExpenseId?e:x)}else expenses.unshift(e); editingExpenseId=null;persist(); ['expenseAmount','payrollGross','payrollNet','payrollIrpef','payrollEmployeeSocial','payrollEmployerSocial','payrollTfr','payrollOtherCost','payrollOtherDue','expenseSupplier','expenseDocNo','expenseDescription'].forEach(id=>$(id).value='');$('saveExpenseBtn').textContent='REGISTRA USCITA';expensePreview();payrollPreview();fillYears();renderExpense();renderDashboard();renderTax();alert(wasEdit?'Uscita aggiornata.':'Uscita registrata.')}
function editExpense(id){const x=expenses.find(v=>v.id===id);if(!x)return;editingExpenseId=id;$('expenseType').value=x.type||'supplier';syncExpenseType();$('expenseAmount').value=num(x.amount)?String(x.amount).replace('.',','):'';$('expenseVatRate').value=String(num(x.vatRate));$('expenseVatDeductible').value=x.vatDeductible??((num(x.vatDeduct)>0&&num(x.vatRate)>0)?'yes':'no');$('expenseVatDeduct').value=x.vatDeduct??100;syncExpenseVatDeductibility(false);$('expenseIresDeduct').value=x.iresDeduct??100;$('expenseIrapDeduct').value=x.irapDeduct??100;$('expensePensionRate').value=x.pensionRate??0;$('expenseWithholdingRate').value=x.withholdingRate??0;$('payrollGross').value=num(x.payrollGross)?String(x.payrollGross).replace('.',','):'';$('payrollNet').value=num(x.payrollNet)?String(x.payrollNet).replace('.',','):'';$('payrollIrpef').value=num(x.payrollIrpef)?String(x.payrollIrpef).replace('.',','):'';$('payrollEmployeeSocial').value=num(x.payrollEmployeeSocial)?String(x.payrollEmployeeSocial).replace('.',','):'';$('payrollEmployerSocial').value=num(x.payrollEmployerSocial)?String(x.payrollEmployerSocial).replace('.',','):'';$('payrollTfr').value=num(x.payrollTfr)?String(x.payrollTfr).replace('.',','):'';$('payrollOtherCost').value=num(x.payrollOtherCost)?String(x.payrollOtherCost).replace('.',','):'';$('payrollOtherDue').value=num(x.payrollOtherDue)?String(x.payrollOtherDue).replace('.',','):'';$('expenseSupplier').value=x.supplier||'';$('expenseDocNo').value=x.docNo||'';$('expenseCategory').value=x.category||'';$('expenseDescription').value=x.description||'';$('expenseDate').value=x.date||today();$('expensePaid').value=x.paid||'yes';$('expensePaymentMethod').value=x.paymentMethod||'Bonifico';if(x.adminContributionProfile)$('adminContributionProfile').value=x.adminContributionProfile;if(x.adminSocialRate!=null)$('adminSocialRate').value=x.adminSocialRate;if(x.adminFrequency)$('adminFrequency').value=x.adminFrequency;if(x.adminAdditionalRate!=null)$('adminAdditionalRate').value=x.adminAdditionalRate;if(x.adminTfmRate!=null)$('adminTfmRate').value=x.adminTfmRate;if(x.salaryFrequency)$('salaryFrequency').value=x.salaryFrequency;if(x.salaryEmployeeRate!=null)$('salaryEmployeeRate').value=x.salaryEmployeeRate;if(x.salaryEmployerRate!=null)$('salaryEmployerRate').value=x.salaryEmployerRate;if(x.salaryTfrRate!=null)$('salaryTfrRate').value=x.salaryTfrRate;if(x.salaryAdditionalRate!=null)$('salaryAdditionalRate').value=x.salaryAdditionalRate;$('saveExpenseBtn').textContent='SALVA MODIFICHE USCITA';expensePreview();payrollPreview();setView('expense');window.scrollTo({top:0,behavior:'smooth'})}
function expenseTypeLabel(t){return {supplier:'Fattura fornitore',professional:'Professionista',salary:'Stipendio',administrator:'Compenso amministratore',rent:'Affitto',asset:'Bene strumentale',bank:'Banca/commissioni',insurance:'Assicurazione',taxcost:'Imposta/tributo',reimbursement:'Rimborso spese',other:'Altro costo'}[t]||t}
function renderExpense(){const y=Number($('expenseYearFilter').value)||curYear(), q=$('expenseSearch').value.trim().toLowerCase(); const list=expenses.filter(x=>ymdYear(x.date)===y&&[x.supplier,x.docNo,x.category,x.description,expenseTypeLabel(x.type)].join(' ').toLowerCase().includes(q)); const cc=list.map(calcExpense); $('expenseTotalCost').textContent=money(sum(cc,x=>x.economicCost));$('expenseTotalVat').textContent=money(sum(cc,x=>x.vat));$('expenseTotalVatDeduct').textContent=money(sum(cc,x=>x.vatDeduct));$('expenseTotalCash').textContent=money(sum(cc,x=>x.cash));$('expenseTotalWithholding').textContent=money(sum(cc,x=>x.withholding));$('expenseTotalSocial').textContent=money(sum(cc,x=>x.social)); $('expenseList').innerHTML=list.map(x=>{const c=calcExpense(x);return `<article class="invoice-item expense"><div class="invoice-top"><strong>${money(c.economicCost)}</strong><span>${safe(x.date)}</span></div><div class="invoice-desc">${safe(x.supplier||'Percettore non indicato')} · ${safe(expenseTypeLabel(x.type))}</div><div class="invoice-meta">${x.type==='salary'||x.type==='administrator'?`Netto: ${money(num(x.payrollNet))} · Ritenute: ${money(c.withholding)} · Contributi/oneri: ${money(c.social)}`:`IVA: ${money(c.vat)} · IVA detraibile: ${c.vatDeduct>0?money(c.vatDeduct)+' ('+clampPct(x.vatDeduct)+'%)':'No'} · Ritenuta: ${money(c.withholding)}`} · ${x.paid==='yes'?'Pagata':'Da pagare'}${x.docNo?' · Doc. '+safe(x.docNo):''}</div><div class="invoice-actions"><button data-edit-expense="${x.id}">Modifica</button><button data-del-expense="${x.id}">Elimina</button></div></article>`}).join(''); $('expenseEmpty').classList.toggle('hidden',list.length>0);document.querySelectorAll('[data-edit-expense]').forEach(b=>b.onclick=()=>editExpense(b.dataset.editExpense));document.querySelectorAll('[data-del-expense]').forEach(b=>b.onclick=()=>{if(confirm('Eliminare questa uscita?')){expenses=expenses.filter(x=>x.id!==b.dataset.delExpense);persist();fillYears();renderExpense();renderDashboard();renderTax()}})}

function renderTax(){const y=Number($('taxYear').value)||curYear(), s=summary(y,'all');$('taxVatDue').textContent=s.vatDue>0?money(s.vatDue):`Credito ${money(s.vatCredit)}`;$('taxWithholdingDue').textContent=money(s.withholdingDue);$('taxSocialDue').textContent=money(s.socialDue);$('taxIresDue').textContent=money(s.iresDue);$('taxIrapDue').textContent=money(s.irapDue);$('taxTotalDue').textContent=money(s.vatDue+s.withholdingDue+s.socialDue+s.iresDue+s.irapDue+s.otherTaxesDue);$('taxPreTaxProfit').textContent=money(s.preTaxProfit);$('taxIresDeductibleCosts').textContent=money(s.iresDeductibleCosts);$('taxIresBase').textContent=money(s.iresBase);$('taxIrapBase').textContent=money(s.irapBase);$('taxPaymentsTotal').textContent=money(s.payments.total); const list=taxPayments.filter(x=>ymdYear(x.date)===y); $('taxPaymentList').innerHTML=list.map(x=>`<article class="invoice-item tax"><div class="invoice-top"><strong>${money(x.amount)}</strong><span>${safe(x.date)}</span></div><div class="invoice-desc">${safe(({vat:'IVA',withholding:'Ritenute',social:'Contributi previdenziali',ires:'IRES',irap:'IRAP',other:'Altra imposta'}[x.type]||x.type))}</div><div class="invoice-meta">${safe(x.note||'Versamento')}</div><div class="invoice-actions"><button data-del-tax="${x.id}">Elimina</button></div></article>`).join('');$('taxPaymentEmpty').classList.toggle('hidden',list.length>0); document.querySelectorAll('[data-del-tax]').forEach(b=>b.onclick=()=>{if(confirm('Eliminare questo versamento?')){taxPayments=taxPayments.filter(x=>x.id!==b.dataset.delTax);persist();renderTax();renderDashboard()}})}
function autoIncomePreset(){
  const cat=$('incomeCategory').value; const rates={'Servizi':22,'Vendite':22,'Abbonamenti':22,'Eventi':22,'Pubblicità / Sponsor':22,'Altro ricavo':22}; if(rates[cat]!=null)$('incomeVatRate').value=String(rates[cat]); incomePreview();
}
function autoFillTaxPayment(){
  const y=Number($('taxYear').value)||curYear(),s=summary(y,'all'),type=$('taxPaymentType').value; const m={vat:s.vatDue,withholding:s.withholdingDue,social:s.socialDue,ires:s.iresDue,irap:s.irapDue,other:s.otherTaxesDue}; setMoneyInput('taxPaymentAmount',m[type]||0);
}
function saveTaxPayment(){const amount=num($('taxPaymentAmount').value); if(amount<=0){alert('Inserisci un importo maggiore di zero.');return}taxPayments.unshift({id:uid(),date:$('taxPaymentDate').value||today(),type:$('taxPaymentType').value,amount,note:$('taxPaymentNote').value.trim()});persist();$('taxPaymentAmount').value='';$('taxPaymentNote').value='';fillYears();renderTax();renderDashboard();alert('Versamento registrato.')}

function loadSettings(){ $('settingIres').value=settings.iresRate;$('settingIrap').value=settings.irapRate;$('settingOpeningCash').value=settings.openingCash;$('settingOpeningVatCredit').value=settings.openingVatCredit;$('settingIresAdjustments').value=settings.iresAdjustments;$('settingIrapAdjustments').value=settings.irapAdjustments;$('settingSalaryEmployeeRate').value=settings.salaryEmployeeRate;$('settingSalaryEmployerRate').value=settings.salaryEmployerRate;$('settingSalaryTfrRate').value=settings.salaryTfrRate;$('settingSalaryAdditionalRate').value=settings.salaryAdditionalRate;$('settingProfessionalPensionRate').value=settings.professionalPensionRate;$('settingProfessionalWithholdingRate').value=settings.professionalWithholdingRate;$('settingRegionalAdditional').value=settings.regionalAdditionalRate;$('settingMunicipalAdditional').value=settings.municipalAdditionalRate;$('settingShareCapital').value=settings.shareCapital;$('settingLegalReserve').value=settings.legalReserve;$('settingFiscalYear').value=settings.fiscalYear||curYear();$('settingOtherTaxesAccrued').value=settings.otherTaxesAccrued||0 }
function saveSettings(){settings={iresRate:num($('settingIres').value),irapRate:num($('settingIrap').value),openingCash:num($('settingOpeningCash').value),openingVatCredit:num($('settingOpeningVatCredit').value),iresAdjustments:num($('settingIresAdjustments').value),irapAdjustments:num($('settingIrapAdjustments').value),salaryEmployeeRate:num($('settingSalaryEmployeeRate').value),salaryEmployerRate:num($('settingSalaryEmployerRate').value),salaryTfrRate:num($('settingSalaryTfrRate').value),salaryAdditionalRate:num($('settingSalaryAdditionalRate').value),professionalPensionRate:num($('settingProfessionalPensionRate').value),professionalWithholdingRate:num($('settingProfessionalWithholdingRate').value),regionalAdditionalRate:num($('settingRegionalAdditional').value),municipalAdditionalRate:num($('settingMunicipalAdditional').value),shareCapital:num($('settingShareCapital').value),legalReserve:num($('settingLegalReserve').value),fiscalYear:num($('settingFiscalYear').value)||curYear(),otherTaxesAccrued:num($('settingOtherTaxesAccrued').value)};persist();if($('expenseType').value==='salary')syncSalaryDefaults();if($('expenseType').value==='professional')applyExpensePreset();renderDashboard();renderTax();alert('Impostazioni salvate.')}

function csvEscape(v){const s=String(v??'');return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function exportCSV(){const rows=[['TIPO','SOTTOTIPO','DATA','SOGGETTO','DOCUMENTO','CATEGORIA','DESCRIZIONE','IMPONIBILE/COSTO','IVA','IVA DETRAIBILE','RITENUTE','CONTRIBUTI','CASSA']]; incomes.forEach(x=>{const c=calcIncome(x);rows.push(['ENTRATA','Ricavo',x.date,x.customer,x.docNo,x.category,x.description,c.net,c.vat,0,0,0,c.cash])});expenses.forEach(x=>{const c=calcExpense(x);rows.push(['USCITA',expenseTypeLabel(x.type),x.date,x.supplier,x.docNo,x.category,x.description,c.economicCost,c.vat,c.vatDeduct,c.withholding,c.social,c.cash])});taxPayments.forEach(x=>rows.push(['VERSAMENTO',x.type,x.date,'','','',x.note,x.amount,0,0,0,0,x.amount])); const csv='\ufeff'+rows.map(r=>r.map(csvEscape).join(';')).join('\n');downloadBlob(csv,'gestione-srl.csv','text/csv;charset=utf-8')}
function downloadBlob(data,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},100)}
function exportBackup(){downloadBlob(JSON.stringify({version:2,exportedAt:new Date().toISOString(),incomes,expenses,taxPayments,settings},null,2),'backup-gestione-srl.json','application/json')}
async function importBackup(file){try{const d=JSON.parse(await file.text());if(!Array.isArray(d.incomes)||!Array.isArray(d.expenses)||!Array.isArray(d.taxPayments))throw new Error();if(!confirm('Importare il backup sostituendo i dati attuali?'))return;incomes=d.incomes;expenses=d.expenses;taxPayments=d.taxPayments;settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});persist();loadSettings();fillYears();renderAll();alert('Backup importato.')}catch{alert('Backup non valido.')}}
function renderAll(){renderDashboard();renderIncome();renderExpense();renderTax()}

// Navigation
$('dashboardTab').onclick=()=>setView('dashboard');$('incomeTab').onclick=()=>setView('income');$('expenseTab').onclick=()=>setView('expense');$('taxTab').onclick=()=>setView('tax');$('settingsTab').onclick=()=>setView('settings');
$('dashYear').onchange=renderDashboard;$('dashMonth').onchange=renderDashboard;$('todayPeriodBtn').onclick=()=>{$('dashYear').value=String(curYear());$('dashMonth').value=String(new Date().getMonth()+1);renderDashboard()};['dashIncomeAmount','dashIncomeVatRate','dashIncomePaid'].forEach(id=>$(id).addEventListener('input',renderDashboard));$('dashIncomeCategory').onchange=()=>{$('dashIncomeVatRate').value='22';renderDashboard()};$('dashSaveIncomeBtn').onclick=saveDashboardIncome;
['incomeAmount','incomeVatRate','incomePaid'].forEach(id=>$(id).addEventListener('input',incomePreview));$('incomeCategory').onchange=autoIncomePreset;$('saveIncomeBtn').onclick=saveIncome;$('cancelIncomeEditBtn').onclick=closeIncomeEdit;['incomeYearFilter','incomeMonthFilter','incomeStatusFilter','incomeCategoryFilter'].forEach(id=>$(id).onchange=renderIncome);$('incomeSearch').oninput=renderIncome;$('clearIncomeBtn').onclick=()=>{if(confirm('Cancellare tutte le entrate registrate?')){incomes=[];persist();fillYears();renderAll()}};
$('expenseType').onchange=syncExpenseType;$('expenseVatDeductible').onchange=()=>syncExpenseVatDeductibility(true);$('expenseVatRate').onchange=()=>syncExpenseVatDeductibility(true);['expenseAmount','expenseVatDeduct','expenseIresDeduct','expenseIrapDeduct','expensePensionRate','expenseWithholdingRate','expensePaid'].forEach(id=>$(id).addEventListener('input',expensePreview));['payrollIrpef','payrollEmployeeSocial','payrollEmployerSocial','payrollTfr','payrollOtherCost','payrollOtherDue','expensePaid'].forEach(id=>$(id).addEventListener('input',payrollPreview));$('payrollNet').addEventListener('input',()=>{$('expenseType').value==='administrator'?autoFillAdministrator():payrollPreview()});$('payrollGross').addEventListener('input',()=>{$('expenseType').value==='salary'?autoFillSalary():payrollPreview()});$('adminContributionProfile').onchange=syncAdminContributionProfile;['adminSocialRate','adminAdditionalRate','adminTfmRate'].forEach(id=>$(id).addEventListener('input',autoFillAdministrator));$('adminFrequency').onchange=autoFillAdministrator;['salaryEmployeeRate','salaryEmployerRate','salaryTfrRate','salaryAdditionalRate'].forEach(id=>$(id).addEventListener('input',autoFillSalary));$('salaryFrequency').onchange=autoFillSalary;$('saveExpenseBtn').onclick=saveExpense;$('expenseYearFilter').onchange=renderExpense;$('expenseSearch').oninput=renderExpense;$('clearExpenseBtn').onclick=()=>{if(confirm('Cancellare tutte le uscite registrate?')){expenses=[];persist();fillYears();renderAll()}};
$('taxYear').onchange=()=>{renderTax();autoFillTaxPayment()};$('taxPaymentType').onchange=autoFillTaxPayment;$('saveTaxPaymentBtn').onclick=saveTaxPayment;$('saveSettingsBtn').onclick=saveSettings;$('exportCsvBtn').onclick=exportCSV;$('exportBackupBtn').onclick=exportBackup;$('importBackupInput').onchange=e=>{const f=e.target.files?.[0];if(f)importBackup(f);e.target.value=''};

$('dashIncomeDate').value=today();$('incomeDate').value=today();$('expenseDate').value=today();$('taxPaymentDate').value=today();fillMonths();fillYears();loadSettings();syncExpenseType();autoIncomePreset();incomePreview();renderAll();autoFillTaxPayment();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
