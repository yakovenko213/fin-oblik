const assert=require('node:assert/strict');
const {createPeriodTools,findClosedPeriodForDate,migratePeriods}=require('./period-core');
const {getSignedAmount}=require('./accounting-core');
const tx=(id,isoDate,type,value,account='A',extra={})=>({id,isoDate,type,value,account,status:'Проведено',...extra});
const transactions=[
 tx(1,'2026-09-01','opening_balance',1000),tx(2,'2026-09-03','income',500),tx(3,'2026-09-04','expense',200),
 tx(4,'2026-09-05','refund_out',50),tx(5,'2026-09-06','refund_in',20),tx(6,'2026-09-07','payout',100,'A',{party:'Руслан'}),
 tx(7,'2026-09-08','contribution',300,'A',{party:'Руслан',contributionKind:'capital'}),
 tx(8,'2026-09-09','contribution',80,'A',{party:'Денис',contributionKind:'loan'}),
 tx(9,'2026-09-10','expense',999,'A',{isDeleted:true}),
 tx(10,'2026-09-11','expense',25,'A',{transferId:'ok',transferOrder:1}),tx(11,'2026-09-11','income',25,'B',{transferId:'ok',transferOrder:2})
];
const tools=createPeriodTools({transactions,accounts:['A','B'],owners:['Руслан','Денис'],signedAmount:getSignedAmount});
assert.equal(tools.getBalanceAt('A','2026-09-30'),1525,'1: баланс на дату');
assert.deepEqual(tools.getMinBalanceInRange('B','2026-09-01','2026-09-30'),{balance:0,date:'2026-09-01'},'2: мінімальний баланс');
assert.deepEqual(tools.computePeriodReport('2026-09-01','2026-09-30'),{income:450,expenses:180,operatingProfit:270,payouts:100},'3: звіт періоду');
assert.equal(tools.computeCumulativeUndistributed('2026-09-30'),170,'4: нерозподілений результат');
assert.deepEqual(tools.computePartnerPositions('2026-09-30'),{Руслан:{capital:300,loanDebt:0},Денис:{capital:0,loanDebt:80}},'5: позиції партнерів');
assert.equal(tools.findBrokenTransfers().length,0,'6: цілісний переказ');
assert.equal(tools.checksum('2026-09-01','2026-09-30'),1550,'7: checksum без видалених');
assert.equal(tools.activeTransactions().length,10,'8: видалені виключено');
assert.equal(findClosedPeriodForDate([{start:'2026-09-01',end:'2026-09-30',status:'closed'}],'2026-09-15').end,'2026-09-30','9: пошук закритого періоду');
assert.deepEqual(migratePeriods([{from:'2026-08-01',to:'2026-08-31',by:'ruslan1'}])[0],{from:'2026-08-01',to:'2026-08-31',by:'ruslan1',id:'legacy-0-2026-08-01-2026-08-31',start:'2026-08-01',end:'2026-08-31',closedBy:'ruslan1',status:'closed',snapshot:null,legacy:true},'10: міграція legacy');
console.log('period-core: 10 сценаріїв пройдено');
