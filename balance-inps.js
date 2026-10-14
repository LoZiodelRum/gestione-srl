(function(){
  function ensureInpsRows(){
    const iresRow=document.getElementById('balanceIrap')?.parentElement;
    if(!iresRow || document.getElementById('balanceSocialGenerated')) return;

    const generated=document.createElement('div');
    generated.innerHTML='<span>Contributi INPS maturati</span><strong id="balanceSocialGenerated">€ 0,00</strong>';

    const paid=document.createElement('div');
    paid.innerHTML='<span>Contributi INPS già versati</span><strong id="balanceSocialPaid">€ 0,00</strong>';

    const due=document.createElement('div');
    due.innerHTML='<span>Contributi INPS da versare</span><strong id="balanceSocialDue">€ 0,00</strong>';

    iresRow.insertAdjacentElement('afterend',due);
    due.insertAdjacentElement('beforebegin',paid);
    paid.insertAdjacentElement('beforebegin',generated);
  }

  function applyValues(){
    if(typeof summary!=='function' || typeof money!=='function') return;
    const yearEl=document.getElementById('balanceYear');
    const y=Number(yearEl?.value)||new Date().getFullYear();
    const s=summary(y,'all');
    const generated=document.getElementById('balanceSocialGenerated');
    const paid=document.getElementById('balanceSocialPaid');
    const due=document.getElementById('balanceSocialDue');
    if(generated) generated.textContent=money(s.socialGenerated);
    if(paid) paid.textContent=money(s.payments?.social||0);
    if(due) due.textContent=money(s.socialDue);
  }

  function install(){
    ensureInpsRows();
    const original=window.renderBalance;
    if(typeof original==='function' && !original.__inpsPatched){
      const wrapped=function(){
        original.apply(this,arguments);
        ensureInpsRows();
        applyValues();
      };
      wrapped.__inpsPatched=true;
      window.renderBalance=wrapped;
      try{ renderBalance=wrapped; }catch(_e){}
    }
    applyValues();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
