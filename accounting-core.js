(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinbaseAccounting=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const roundMoney=value=>Math.round((Number(value)||0)*100)/100||0;
  const valueOf=tx=>roundMoney(Number.isFinite(Number(tx?.value))?Number(tx.value):(Number(String(tx?.amount||'').replace(/[^\d,.-]/g,'').replace(/\s/g,'').replace(',','.'))||0));
  function getSignedAmount(tx){const amount=valueOf(tx);if(tx?.transferId||tx?.isTransfer){if(Number(tx.transferOrder)===1)return-amount;if(Number(tx.transferOrder)===2)return amount}if(['expense','payout','contribution_return','refund_out'].includes(tx?.type))return-amount;if(['income','refund_in','contribution','opening_balance'].includes(tx?.type))return amount;return 0}
  const requiresFundsCheck=tx=>getSignedAmount(tx)<0;
  const getRefundType=direction=>direction==='refund_in'?'refund_in':direction==='refund_out'?'refund_out':'';
  const isoDate=value=>{if(typeof value==='string')return value.slice(0,10);const date=value instanceof Date?value:new Date(value);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};
  function freezeThroughDate(settings={},today=new Date()){
    if(settings.freezeEnabled===false)return'';
    if(settings.freezeHorizon==='all')return'9999-12-31';
    const date=new Date(`${isoDate(today)}T00:00:00`);
    if(settings.freezeHorizon==='days'){date.setDate(date.getDate()+Math.max(0,Number(settings.horizonDays)||0))}
    else date.setMonth(date.getMonth()+2,0);
    return isoDate(date);
  }
  const remainingAmount=payment=>Math.max(0,roundMoney(Number(payment?.amount)-Number(payment?.paidAmount||0)));
  function isFrozenPayment(payment,settings,today){const through=freezeThroughDate(settings,today);return Boolean(through&&payment?.status==='planned'&&!payment?.isDeleted&&remainingAmount(payment)>0&&String(payment.dueDate||'')<=through)}
  function frozen(account,plannedPayments=[],plannedSettings={},today=new Date()){return roundMoney(plannedPayments.filter(payment=>payment.account===account&&isFrozenPayment(payment,plannedSettings,today)).reduce((sum,payment)=>sum+remainingAmount(payment),0))}
  function available(account,balance,plannedPayments=[],plannedSettings={},today=new Date()){return roundMoney(Number(balance||0)-frozen(account,plannedPayments,plannedSettings,today))}
  function deficit(account,balance,plannedPayments=[],plannedSettings={},today=new Date()){return Math.max(0,roundMoney(frozen(account,plannedPayments,plannedSettings,today)-Number(balance||0)))}
  function frozenTotal(plannedPayments=[],plannedSettings={},today=new Date()){return roundMoney(plannedPayments.filter(payment=>isFrozenPayment(payment,plannedSettings,today)).reduce((sum,payment)=>sum+remainingAmount(payment),0))}
  function freeMoney(balances={},plannedPayments=[],plannedSettings={},options={},today=new Date()){
    const reserveAccount=options.reserveAccount||'';
    let total=Object.entries(balances).filter(([account])=>account!==reserveAccount).reduce((sum,[account,balance])=>sum+Math.max(available(account,balance,plannedPayments,plannedSettings,today),0),0);
    const reserveIsAlreadyExcluded=reserveAccount&&options.workingCapitalReserveAccount===reserveAccount;
    if(options.workingCapitalReserveIsVirtual&&!reserveIsAlreadyExcluded)total-=Math.max(0,Number(options.workingCapitalReserve)||0);
    return Math.max(0,roundMoney(total));
  }
  function coverageByMonth(balances={},plannedPayments=[],plannedSettings={},today=new Date()){
    const eligible=plannedPayments.filter(payment=>isFrozenPayment(payment,plannedSettings,today));
    const months=[...new Set(eligible.map(payment=>String(payment.dueDate).slice(0,7)))].sort();
    const funds=Object.fromEntries(Object.entries(balances).map(([account,balance])=>[account,Math.max(0,Number(balance)||0)]));
    return months.map(month=>{
      const byAccount={};eligible.filter(payment=>String(payment.dueDate).startsWith(month)).forEach(payment=>{byAccount[payment.account]=roundMoney((byAccount[payment.account]||0)+remainingAmount(payment))});
      const required=roundMoney(Object.values(byAccount).reduce((sum,value)=>sum+value,0));
      const covered=roundMoney(Object.entries(byAccount).reduce((sum,[account,needed])=>{const amount=Math.min(needed,funds[account]||0);funds[account]=roundMoney((funds[account]||0)-amount);return sum+amount},0));
      const monthDeficit=roundMoney(required-covered),percent=required?roundMoney(covered/required*100):100;
      return{month,required,covered,percent,deficit:monthDeficit};
    });
  }
  function accountAvailabilityDecision(account,amount,txType,plannedPaymentId,context={}){
    const requested=Math.max(0,roundMoney(amount)),balance=roundMoney(context.balance),plannedPayments=context.plannedPayments||[],settings=context.plannedSettings||{},today=context.today||new Date();
    const frozenAmount=frozen(account,plannedPayments,settings,today),availableAmount=roundMoney(balance-frozenAmount);
    const payment=txType==='expense'&&plannedPaymentId?plannedPayments.find(item=>String(item.id)===String(plannedPaymentId)&&item.status==='planned'&&!item.isDeleted):null;
    const exemption=payment&&payment.account===account?Math.min(requested,remainingAmount(payment)):0;
    const requiredAvailable=roundMoney(requested-exemption),availabilityShortfall=Math.max(0,roundMoney(requiredAvailable-Math.max(availableAmount,0))),physicalShortfall=Math.max(0,roundMoney(requested-Math.max(balance,0))),messageShortfall=exemption?availabilityShortfall:Math.max(0,roundMoney(requested-availableAmount));
    return{ok:availabilityShortfall===0&&physicalShortfall===0,account,amount:requested,balance,frozen:frozenAmount,available:availableAmount,requiredAvailable,shortfall:Math.max(messageShortfall,physicalShortfall),payment};
  }
  function maxPayout(accruedUnpaid,freeAmount,accountAvailableAmount,plannedDeficit=0){return plannedDeficit>0?0:Math.max(0,roundMoney(Math.min(Number(accruedUnpaid)||0,Number(freeAmount)||0,Number(accountAvailableAmount)||0)))}
  return{roundMoney,valueOf,getSignedAmount,requiresFundsCheck,getRefundType,freezeThroughDate,remainingAmount,isFrozenPayment,frozen,available,deficit,frozenTotal,freeMoney,coverageByMonth,accountAvailabilityDecision,maxPayout};
});
