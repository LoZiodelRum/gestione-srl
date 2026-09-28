const euro = new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
const $ = id => document.getElementById(id);
const STORAGE_MOVEMENTS='srl_movements_v2';
const STORAGE_SETTINGS='srl_settings_v2';

let movements = loadJSON(STORAGE_MOVEMENTS, []);
let settings = Object.assign({
  iresRate:24,
  irapRate:3.9,
  dividendRate:26,
  shareCapital:10000,
  legalReserveCurrent:0,
  openingCash:0,
  openingVatCredit:0,
  iresAdditions:0,
  iresReductions:0,
  irapAdjustment:0
}, loadJSON(STORAGE_SETTINGS, {}));

function loadJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;}}
function num(v){if(typeof v==='number')return Number.isFinite(v)?v:0;return parseFloat(String(v??'0').trim().replace(/\s/g,'').replace(/\./g,'').replace(',','.'))||0;}
function clamp(v,min,max){return Math.min(max,Math.max(min,num(v)));}
function fmt(v){return euro.format(Number.isFinite(v)?v:0);}
function today(){return new Date().toISOString().slice(0,10);}
function currentYear(){return new Date().getFullYear();}
function saveMovements(){localStorage.setItem(STORAGE_MOVEMENTS,JSON.stringify(movements));}
function saveSettings(){localStorage.setItem(STORAGE_SETTINGS,JSON.stringify(settings));}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
function formatDate(s){if(!s)return'';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`;}
function selectedYear(){return Number($('periodYear').value)||currentYear();}
function inSelectedYear(m){return String(m.date||'').startsWith(String(selectedYear()));}
function selectedMovements(){return movements.filter(inSelectedYear);}

const TYPE_LABELS={
  income:'Entrata / Ricavo',expense:'Uscita / Costo',capital_in:'Entrata finanziaria',capital_out:'Uscita finanziaria',vat_payment:'Versamento IVA',tax_payment:'Versamento imposte',dividend_payment:'Pagamento dividendi'
};

function isEconomicType(type){return type==='income'||type==='expense';}
function isCashIn(type){return type==='income'||type==='capital_in';}
function isCashOut(type){return ['expense','capital_out','vat_payment','tax_payment','dividend_payment'].includes(type);}

function movementFromForm(){
  const type=$('movementType').value;
  const amount=num($('amount').value);
  const economic=isEconomicType(type);
  const vatRate=economic?num($('vatRate').value):0;
  const vat=amount*vatRate/100;
  return {
    id:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),
    type,amount,vatRate,vat,
    vatDeductibility:type==='expense'?clamp($('vatDeductibility').value,0,100):0,
    taxDeductibility:type==='expense'?clamp($('taxDeductibility').value,0,100):0,
    irapDeductibility:type==='expense'?clamp($('irapDeductibility').value,0,100):0,
    category:$('category').value.trim(),description:$('description').value.trim(),date:$('movementDate').value||today()
  };
}

function summarize(list=selectedMovements(), extra=null){
  const arr=extra?[...list,extra]:list;
  let revenue=0,costs=0,grossReceipts=0,grossPayments=0,vatOut=0,vatInDed=0,deductibleCostsIres=0,deductibleCostsIrap=0;
  let cashInFinancial=0,cashOutFinancial=0,vatPayments=0,taxPayments=0,dividendPayments=0;
  for(const m of arr){
    const amount=num(m.amount), vat=num(m.vat);
    switch(m.type){
      case'income': revenue+=amount;grossReceipts+=amount+vat;vatOut+=vat;break;
      case'expense': costs+=amount;grossPayments+=amount+vat;vatInDed+=vat*clamp(m.vatDeductibility,0,100)/100;deductibleCostsIres+=amount*clamp(m.taxDeductibility,0,100)/100;deductibleCostsIrap+=amount*clamp(m.irapDeductibility,0,100)/100;break;
      case'capital_in': cashInFinancial+=amount;break;
      case'capital_out': cashOutFinancial+=amount;break;
      case'vat_payment': vatPayments+=amount;cashOutFinancial+=amount;break;
      case'tax_payment': taxPayments+=amount;cashOutFinancial+=amount;break;
      case'dividend_payment': dividendPayments+=amount;cashOutFinancial+=amount;break;
    }
  }
  const vatPosition=vatOut-vatInDed-settings.openingVatCredit;
  const vatDueGross=Math.max(0,vatPosition);
  const vatCredit=Math.max(0,-vatPosition);
  const vatDueRemaining=Math.max(0,vatDueGross-vatPayments);
  const preTaxProfit=revenue-costs;
  const iresBaseBeforeAdjustments=revenue-deductibleCostsIres;
  const taxableProfit=Math.max(0,iresBaseBeforeAdjustments+num(settings.iresAdditions)-num(settings.iresReductions));
  const irapBase=Math.max(0,revenue-deductibleCostsIrap+num(settings.irapAdjustment));
  const ires=taxableProfit*clamp(settings.iresRate,0,100)/100;
  const irap=irapBase*clamp(settings.irapRate,0,100)/100;
  const taxesEstimated=ires+irap;
  const taxesRemaining=Math.max(0,taxesEstimated-taxPayments);
  const netProfit=preTaxProfit-taxesEstimated;
  const legalReserveCap=Math.max(0,num(settings.shareCapital)*0.20-num(settings.legalReserveCurrent));
  const legalReserveAccrual=netProfit>0?Math.min(netProfit*0.05,legalReserveCap):0;
  const distributable=Math.max(0,netProfit-legalReserveAccrual);
  const registeredCash=num(settings.openingCash)+grossReceipts+cashInFinancial-grossPayments-cashOutFinancial;
  const prudentCash=registeredCash-vatDueRemaining-taxesRemaining;
  return {revenue,costs,grossReceipts,grossPayments,vatOut,vatInDed,vatDueGross,vatCredit,vatPayments,vatDueRemaining,deductibleCostsIres,deductibleCostsIrap,preTaxProfit,iresBaseBeforeAdjustments,taxableProfit,irapBase,ires,irap,taxesEstimated,taxPayments,taxesRemaining,netProfit,legalReserveAccrual,distributable,cashInFinancial,cashOutFinancial,dividendPayments,registeredCash,prudentCash};
}

function populateYears(){
  const years=new Set([currentYear(),...movements.map(m=>Number(String(m.date||'').slice(0,4))).filter(Boolean)]);
  const currentSelection=Number($('periodYear').value)||currentYear();
  $('periodYear').innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join('');
  $('periodYear').value=String(years.has(currentSelection)?currentSelection:currentYear());
}

function renderSummary(usePreview=true){
  const m=movementFromForm();
  const preview=usePreview&&m.amount>0&&String(m.date).startsWith(String(selectedYear()))?m:null;
  const s=summarize(selectedMovements(),preview);
  $('previewRevenue').textContent=fmt(s.revenue);
  $('previewCosts').textContent=fmt(s.costs);
  $('previewVat').textContent=s.vatDueRemaining>0?fmt(s.vatDueRemaining):(s.vatCredit>0?`Credito ${fmt(s.vatCredit)}`:fmt(0));
  $('previewIres').textContent=fmt(s.ires);
  $('previewIrap').textContent=fmt(s.irap);
  $('previewNetProfit').textContent=fmt(s.netProfit);
  $('grossReceipts').textContent=fmt(s.grossReceipts);
  $('grossPayments').textContent=fmt(s.grossPayments);
  $('preTaxProfit').textContent=fmt(s.preTaxProfit);
  $('deductibleCostsIres').textContent=fmt(s.deductibleCostsIres);
  $('taxableProfit').textContent=fmt(s.taxableProfit);
  $('irapBase').textContent=fmt(s.irapBase);
  $('totalTaxes').textContent=fmt(s.taxesEstimated);
  $('taxesPaid').textContent=fmt(s.taxPayments);
  $('cashAfterTaxes').textContent=fmt(s.prudentCash);
  renderDistribution(s);
  renderMonthlyTable(preview);
}

function renderDistribution(s=summarize()){
  const pct=clamp($('distributionPercent').value,0,100)/100;
  const gross=s.distributable*pct;
  const tax=gross*clamp(settings.dividendRate,0,100)/100;
  $('netProfitForDistribution').textContent=fmt(s.netProfit);
  $('legalReserveAccrual').textContent=fmt(s.legalReserveAccrual);
  $('distributableProfit').textContent=fmt(s.distributable);
  $('grossDividend').textContent=fmt(gross);
  $('dividendTax').textContent=fmt(tax);
  $('netDividend').textContent=fmt(gross-tax);
}

function renderMonthlyTable(extra=null){
  const list=extra?[...selectedMovements(),extra]:selectedMovements();
  const names=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const data=Array.from({length:12},()=>({r:0,c:0}));
  list.forEach(m=>{const month=Number(String(m.date||'').slice(5,7))-1;if(month<0||month>11)return;if(m.type==='income')data[month].r+=num(m.amount);if(m.type==='expense')data[month].c+=num(m.amount);});
  $('monthlyTableBody').innerHTML=data.map((x,i)=>`<tr><td>${names[i]}</td><td>${fmt(x.r)}</td><td>${fmt(x.c)}</td><td>${fmt(x.r-x.c)}</td></tr>`).join('');
}

function renderMovements(){
  const filter=$('movementFilter').value,q=$('searchMovement').value.trim().toLowerCase();
  const list=selectedMovements().filter(m=>(filter==='all'||m.type===filter)&&(!q||`${m.category} ${m.description} ${TYPE_LABELS[m.type]||''}`.toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id)));
  $('movementList').innerHTML='';$('emptyState').style.display=list.length?'none':'block';
  for(const m of list){
    const el=document.createElement('div');el.className=`invoice-item ${m.type}`;
    const economic=isEconomicType(m.type),gross=economic?num(m.amount)+num(m.vat):num(m.amount),sign=isCashIn(m.type)?'+':'−';
    const meta=economic?`Imponibile: ${fmt(m.amount)} · IVA ${m.vatRate}%: ${fmt(m.vat)}${m.type==='expense'?` · IVA detraibile ${m.vatDeductibility}% · Deducibilità IRES ${m.taxDeductibility}% · IRAP ${m.irapDeductibility}%`:''}`:`Movimento finanziario: ${fmt(m.amount)}`;
    el.innerHTML=`<div class="invoice-top"><div><strong>${sign} ${fmt(gross)}</strong><div class="invoice-desc">${escapeHtml(TYPE_LABELS[m.type]||m.type)} · ${escapeHtml(m.category||'Senza categoria')} · ${escapeHtml(m.description||'Nessuna descrizione')}</div></div><span>${formatDate(m.date)}</span></div><div class="invoice-meta">${meta}</div><div class="invoice-actions"><button data-delete="${escapeHtml(m.id)}" type="button">Elimina</button></div>`;
    $('movementList').appendChild(el);
  }
}

function syncMovementFields(){
  const type=$('movementType').value,economic=isEconomicType(type),expense=type==='expense';
  document.querySelectorAll('.economic-only').forEach(el=>el.style.display=economic?'':'none');
  document.querySelectorAll('.expense-only').forEach(el=>el.style.display=expense?'':'none');
  $('amountLabel').textContent=economic?'IMPONIBILE':'IMPORTO';
  const hints={income:'Registra un ricavo: l’IVA confluisce nell’IVA a debito.',expense:'Registra un costo: imposta detraibilità IVA e deducibilità IRES/IRAP.',capital_in:'Entrata di cassa senza effetto su ricavi, IVA o imponibile fiscale.',capital_out:'Uscita di cassa senza deduzione fiscale automatica.',vat_payment:'Versamento IVA: riduce il debito IVA residuo e la cassa.',tax_payment:'Versamento IRES/IRAP: riduce le imposte residue e la cassa.',dividend_payment:'Pagamento dividendi: riduce la cassa senza incidere sul risultato economico corrente.'};
  $('movementHint').textContent=hints[type]||'';
}

function resetForm(){
  $('amount').value='';$('category').value='';$('description').value='';$('movementDate').value=today();$('vatRate').value='22';$('vatDeductibility').value=100;$('taxDeductibility').value=100;$('irapDeductibility').value=100;syncMovementFields();renderSummary(false);
}
function loadSettings(){['iresRate','irapRate','dividendRate','shareCapital','legalReserveCurrent','openingCash','openingVatCredit','iresAdditions','iresReductions','irapAdjustment'].forEach(id=>{$(id).value=settings[id]??0;});}
function setView(name){['dashboard','movements','settings'].forEach(v=>{$(`${v}View`).classList.toggle('active',v===name);$(`${v}Tab`).classList.toggle('active',v===name);});if(name==='movements')renderMovements();if(name==='dashboard')renderSummary(false);}

function exportCSV(){
  const rows=[['Data','Tipo','Categoria','Descrizione','Imponibile/Importo','IVA %','IVA','IVA detraibile %','Deducibilita IRES %','Deducibilita IRAP %']];
  selectedMovements().sort((a,b)=>a.date.localeCompare(b.date)).forEach(m=>rows.push([m.date,TYPE_LABELS[m.type]||m.type,m.category,m.description,m.amount,m.vatRate,m.vat,m.vatDeductibility,m.taxDeductibility,m.irapDeductibility]));
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');downloadBlob(`srl-movimenti-${selectedYear()}.csv`,new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
}
function exportBackup(){const payload={version:2,exportedAt:new Date().toISOString(),movements,settings};downloadBlob(`srl-backup-${today()}.json`,new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));}
function downloadBlob(filename,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);}

$('saveMovementBtn').addEventListener('click',()=>{const m=movementFromForm();if(m.amount<=0){alert('Inserisci un importo maggiore di zero.');return;}movements.push(m);saveMovements();populateYears();$('periodYear').value=String(Number(m.date.slice(0,4))||currentYear());resetForm();renderMovements();alert('Movimento registrato.');});
$('clearAllBtn').addEventListener('click',()=>{if(confirm(`Vuoi cancellare tutti i movimenti del ${selectedYear()}?`)){movements=movements.filter(m=>!inSelectedYear(m));saveMovements();populateYears();renderMovements();renderSummary(false);}});
$('movementList').addEventListener('click',e=>{const id=e.target.dataset.delete;if(id&&confirm('Eliminare questo movimento?')){movements=movements.filter(m=>String(m.id)!==String(id));saveMovements();populateYears();renderMovements();renderSummary(false);}});
$('saveSettingsBtn').addEventListener('click',()=>{settings={iresRate:clamp($('iresRate').value,0,100),irapRate:clamp($('irapRate').value,0,100),dividendRate:clamp($('dividendRate').value,0,100),shareCapital:Math.max(0,num($('shareCapital').value)),legalReserveCurrent:Math.max(0,num($('legalReserveCurrent').value)),openingCash:num($('openingCash').value),openingVatCredit:Math.max(0,num($('openingVatCredit').value)),iresAdditions:Math.max(0,num($('iresAdditions').value)),iresReductions:Math.max(0,num($('iresReductions').value)),irapAdjustment:num($('irapAdjustment').value)};saveSettings();renderSummary(false);alert('Impostazioni salvate.');});
['amount','vatRate','vatDeductibility','taxDeductibility','irapDeductibility','movementType','movementDate'].forEach(id=>$(id).addEventListener('input',()=>{syncMovementFields();renderSummary(true);}));
$('distributionPercent').addEventListener('input',()=>renderDistribution(summarize()));
$('movementFilter').addEventListener('change',renderMovements);$('searchMovement').addEventListener('input',renderMovements);
$('periodYear').addEventListener('change',()=>{renderSummary(false);renderMovements();});
$('goCurrentYearBtn').addEventListener('click',()=>{$('periodYear').value=String(currentYear());renderSummary(false);renderMovements();});
$('dashboardTab').addEventListener('click',()=>setView('dashboard'));$('movementsTab').addEventListener('click',()=>setView('movements'));$('settingsTab').addEventListener('click',()=>setView('settings'));
$('exportCsvBtn').addEventListener('click',exportCSV);$('exportBackupBtn').addEventListener('click',exportBackup);
$('importBackupInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.movements)||typeof data.settings!=='object')throw new Error();if(!confirm('Importare il backup sostituendo i dati attuali?'))return;movements=data.movements;settings=Object.assign(settings,data.settings);saveMovements();saveSettings();loadSettings();populateYears();renderSummary(false);renderMovements();alert('Backup importato.');}catch{alert('File di backup non valido.');}finally{e.target.value='';}});

$('movementDate').value=today();loadSettings();populateYears();syncMovementFields();renderSummary(false);renderMovements();
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
