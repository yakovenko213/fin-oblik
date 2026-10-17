(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinbasePlannedPayments=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const kinds=['tax','goods','delivery','rent','ads','salary','other'];
  const statuses=['planned','paid','cancelled'];
  const horizons=['next_month_end','days','all'];
  const defaultSettings=Object.freeze({freezeEnabled:true,freezeHorizon:'next_month_end',horizonDays:30});
  const datePattern=/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;
  const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
  const roundMoney=value=>Math.round((Number(value)||0)*100)/100||0;

  function remainingAmount(payment){return roundMoney(Number(payment?.amount)-Number(payment?.paidAmount||0))}
  function freezeThroughDate(settings,today=new Date()){
    const normalized=normalizeSettings(settings);if(!normalized.freezeEnabled)return'';if(normalized.freezeHorizon==='all')return'9999-12-31';
    const date=new Date(`${typeof today==='string'?today:today.toISOString().slice(0,10)}T00:00:00`);
    if(normalized.freezeHorizon==='days')date.setDate(date.getDate()+normalized.horizonDays);
    else date.setMonth(date.getMonth()+2,0);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function isInFreezeHorizon(payment,settings,today=new Date()){const through=freezeThroughDate(settings,today);return Boolean(through&&payment?.status==='planned'&&!payment?.isDeleted&&remainingAmount(payment)>0&&payment.dueDate<=through)}
  function normalizeSettings(value={}){return{
    freezeEnabled:value.freezeEnabled===undefined?defaultSettings.freezeEnabled:Boolean(value.freezeEnabled),
    freezeHorizon:horizons.includes(value.freezeHorizon)?value.freezeHorizon:defaultSettings.freezeHorizon,
    horizonDays:Number.isInteger(Number(value.horizonDays))&&Number(value.horizonDays)>=0?Number(value.horizonDays):defaultSettings.horizonDays
  }}
  function validatePayment(payment){
    const errors=[];
    if(!payment?.id)errors.push('id is required');
    if(!String(payment?.name||'').trim())errors.push('name is required');
    if(!kinds.includes(payment?.kind))errors.push('kind is invalid');
    if(!String(payment?.account||'').trim())errors.push('account is required');
    if(!(Number(payment?.amount)>0))errors.push('amount must be greater than 0');
    if(Number(payment?.paidAmount||0)<0)errors.push('paidAmount cannot be negative');
    if(Number(payment?.paidAmount||0)>Number(payment?.amount||0))errors.push('paidAmount cannot exceed amount');
    if(!datePattern.test(payment?.dueDate||''))errors.push('dueDate must use YYYY-MM-DD');
    if(!statuses.includes(payment?.status))errors.push('status is invalid');
    if(payment?.basisMonth&&!monthPattern.test(payment.basisMonth))errors.push('basisMonth must use YYYY-MM');
    return errors;
  }
  function createPayment(input,context={}){
    const payment={...input,paidAmount:roundMoney(input?.paidAmount||0),isEstimate:Boolean(input?.isEstimate),note:input?.note||'',createdBy:input?.createdBy||context.createdBy||'',createdAt:input?.createdAt||new Date().toISOString(),isDeleted:Boolean(input?.isDeleted)};
    const errors=validatePayment(payment);if(errors.length)throw new Error(errors.join('; '));return payment;
  }
  function migrateState(state={}){return{...state,plannedPayments:Array.isArray(state.plannedPayments)?state.plannedPayments:[],plannedSettings:normalizeSettings(state.plannedSettings)}}
  function updateSettings(current,patch,role){if(role!=='Власник')throw new Error('Змінювати налаштування планових платежів може лише Власник.');return normalizeSettings({...current,...patch})}
  function monthEnd(month){const[year,value]=month.split('-').map(Number);return`${year}-${String(value).padStart(2,'0')}-${new Date(year,value,0).getDate()}`}
  function nextMonthDate(month,day){const[year,value]=month.split('-').map(Number),date=new Date(year,value,Math.max(1,Number(day)||1));if(date.getMonth()!==value)date.setDate(0);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
  function taxAmount(rule,month,transactions=[]){if(rule.basis==='fixed')return roundMoney(rule.value);const net=transactions.filter(tx=>!tx.isDeleted&&String(tx.isoDate||'').startsWith(month)).reduce((sum,tx)=>sum+(tx.type==='income'?Number(tx.value||0):tx.type==='refund_out'?-Number(tx.value||0):0),0);return roundMoney(Math.max(0,net)*Number(rule.value||0)/100)}
  function buildTaxPayment(rule,month,transactions=[],closed=false,existing={}){const amount=taxAmount(rule,month,transactions),paidAmount=Number(existing.paidAmount||0);return{...existing,id:existing.id||`tax-${rule.id}-${month}`,name:rule.name,kind:'tax',account:rule.account,amount,paidAmount,dueDate:nextMonthDate(month,rule.payDay),status:existing.status==='cancelled'?'cancelled':paidAmount>=amount&&amount>0?'paid':'planned',basisMonth:month,isEstimate:!closed,note:existing.note||'',createdBy:existing.createdBy||'',createdAt:existing.createdAt||new Date().toISOString(),isDeleted:Boolean(existing.isDeleted),taxRuleId:rule.id}}
  function recalculateTaxPayments({rules=[],payments=[],transactions=[],closedPeriods=[]}){const months=[...new Set(transactions.map(tx=>String(tx.isoDate||'').slice(0,7)).filter(value=>/^\d{4}-\d{2}$/.test(value)))],result=payments.map(item=>({...item})),changes=[],warnings=[];for(const rule of rules.filter(item=>item.active)){for(const month of months){const index=result.findIndex(item=>item.taxRuleId===rule.id&&item.basisMonth===month),existing=index>=0?result[index]:{},closed=closedPeriods.some(period=>period.status==='closed'&&monthEnd(month)>=(period.start||period.from)&&monthEnd(month)<=(period.end||period.to));if(existing.isEstimate===false||existing.status==='cancelled'||existing.isDeleted)continue;const next=buildTaxPayment(rule,month,transactions,closed,existing);if(index<0&&next.amount<=0)continue;if(next.amount<next.paidAmount)warnings.push({id:next.id,amount:next.amount,paidAmount:next.paidAmount});if(JSON.stringify(existing)!==JSON.stringify(next)){if(index>=0)result[index]=next;else result.push(next);changes.push({old:index>=0?existing:null,new:next})}}}return{payments:result,changes,warnings}}
  return{kinds,statuses,horizons,defaultSettings,remainingAmount,freezeThroughDate,isInFreezeHorizon,normalizeSettings,validatePayment,createPayment,migrateState,updateSettings,monthEnd,nextMonthDate,taxAmount,buildTaxPayment,recalculateTaxPayments};
});
