const assert=require('node:assert/strict');
const{getSignedAmount,requiresFundsCheck,getRefundType,frozen,available,deficit,frozenTotal,freeMoney,coverageByMonth,accountAvailabilityDecision,maxPayout}=require('./accounting-core');
const balance=list=>list.reduce((sum,tx)=>sum+getSignedAmount(tx),0);
const expenses=list=>Math.abs(list.filter(tx=>['expense','refund_in'].includes(tx.type)).reduce((sum,tx)=>sum+getSignedAmount(tx),0));
const income=list=>list.filter(tx=>['income','refund_out'].includes(tx.type)).reduce((sum,tx)=>sum+getSignedAmount(tx),0);
const a=[{type:'refund_in',value:200}];assert.equal(balance(a),200);assert.equal(balance(a)<0,false);
assert.equal(requiresFundsCheck(a[0]),false);
const b=[{type:'expense',value:200},{type:'refund_in',value:200}];assert.equal(expenses(b),0);assert.equal(balance(b),0);
const c=[{type:'income',value:1000},{type:'refund_out',value:300}];assert.equal(income(c),700);assert.equal(balance(c),700);
assert.equal(getSignedAmount({type:'expense',value:50,transferId:'x',transferOrder:2}),50);
assert.equal(getSignedAmount({type:'income',value:50,transferId:'x',transferOrder:1}),-50);
assert.equal(getRefundType('refund_in'),'refund_in');
assert.equal(getRefundType('refund_out'),'refund_out');
assert.equal(requiresFundsCheck({type:'refund_out',value:1}),true);

const settings={freezeEnabled:true,freezeHorizon:'next_month_end',horizonDays:30},today='2026-10-17';
const payments=[
  {account:'ФОП новапей',amount:20000,paidAmount:0,dueDate:'2026-10-20',status:'planned'},
  {account:'ФОП новапей',amount:30000,paidAmount:0,dueDate:'2026-10-25',status:'planned'},
  {account:'ФОП новапей',amount:15000,paidAmount:0,dueDate:'2026-11-01',status:'planned'},
  {account:'ФОП новапей',amount:120000,paidAmount:20000,dueDate:'2026-11-15',status:'planned'}
];
assert.equal(frozen('ФОП новапей',payments,settings,today),165000);
assert.equal(available('ФОП новапей',246652,payments,settings,today),81652);

const overcommitted=[{account:'A',amount:130000,paidAmount:0,dueDate:'2026-10-20',status:'planned'}];
assert.equal(deficit('A',100000,overcommitted,settings,today),30000);
assert.equal(freeMoney({A:100000},overcommitted,settings,{},today),0);
assert.equal(frozenTotal(overcommitted,settings,today),130000);

assert.equal(frozen('A',[{account:'A',amount:50000,dueDate:'2027-01-10',status:'planned'}],settings,today),0);
assert.equal(frozen('A',[{account:'A',amount:10000,dueDate:'2026-10-01',status:'planned'}],settings,today),10000);
assert.equal(frozen('A',[{account:'A',amount:10000,dueDate:'2026-10-20',status:'cancelled'},{account:'A',amount:10000,dueDate:'2026-10-20',status:'planned',isDeleted:true}],settings,today),0);

const coverage=coverageByMonth({'ФОП новапей':100000},payments,settings,today);
assert.deepEqual(coverage,[
  {month:'2026-10',required:50000,covered:50000,percent:100,deficit:0},
  {month:'2026-11',required:115000,covered:50000,percent:43.48,deficit:65000}
]);
assert.equal(freeMoney({A:200000,'Резервний фонд':50000},[],settings,{reserveAccount:'Резервний фонд',workingCapitalReserve:50000,workingCapitalReserveIsVirtual:true,workingCapitalReserveAccount:'Резервний фонд'},today),200000);
assert.equal(freeMoney({A:200000},[],settings,{workingCapitalReserve:50000,workingCapitalReserveIsVirtual:true},today),150000);
const availabilityContext={balance:246652,plannedPayments:payments,plannedSettings:settings,today};
assert.equal(accountAvailabilityDecision('ФОП новапей',90000,'payout',null,availabilityContext).ok,false);
assert.equal(accountAvailabilityDecision('ФОП новапей',80000,'expense',null,availabilityContext).ok,true);
assert.equal(accountAvailabilityDecision('ФОП новапей',90000,'expense',null,availabilityContext).available,81652);
assert.equal(accountAvailabilityDecision('ФОП новапей',50000,'transfer',null,availabilityContext).ok,true);
assert.equal(accountAvailabilityDecision('ФОП новапей',90000,'transfer',null,availabilityContext).ok,false);
assert.equal(accountAvailabilityDecision('A',100000,'expense',null,{balance:100000,plannedPayments:[],plannedSettings:settings,today}).ok,true);
const linked=[{id:'plan-1',account:'A',amount:90000,paidAmount:0,dueDate:'2026-10-20',status:'planned'}];
assert.equal(accountAvailabilityDecision('A',90000,'expense','plan-1',{balance:100000,plannedPayments:linked,plannedSettings:settings,today}).ok,true);
assert.equal(accountAvailabilityDecision('B',90000,'expense','plan-1',{balance:100000,plannedPayments:linked,plannedSettings:settings,today}).ok,true);
assert.equal(accountAvailabilityDecision('B',100001,'expense','plan-1',{balance:100000,plannedPayments:linked,plannedSettings:settings,today}).ok,false);
const reservedScenario={balance:3000,plannedPayments:[{id:'plan-3000',account:'A',amount:1000,paidAmount:0,dueDate:'2026-10-20',status:'planned'}],plannedSettings:settings,today};
assert.equal(accountAvailabilityDecision('A',2000,'expense',null,reservedScenario).ok,true);
assert.equal(accountAvailabilityDecision('A',2000.01,'expense',null,reservedScenario).ok,false);
assert.equal(accountAvailabilityDecision('A',2000.01,'expense',null,reservedScenario).available,2000);
assert.equal(maxPayout(90000,81652,100000),81652);
assert.equal(maxPayout(90000,0,0,30000),0);
console.log('accounting-core: 37 assertions passed');
