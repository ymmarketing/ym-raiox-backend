import assert from 'node:assert/strict';
import {
  VOS_INTELLIGENCE_VERSION,
  P8,
  calculateBusinessKpis,
  assessDataQuality,
  orderPriorities,
  buildTarget,
  validateMicroAction,
} from '../lib/vos-intelligence-v1.js';

assert.equal(VOS_INTELLIGENCE_VERSION,'VOS_INTELLIGENCE_1.0');
assert.deepEqual(P8,['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance']);

const k=calculateBusinessKpis({
  visits:10000, leads:500, contacted_leads:300, opportunities:120,
  proposals:80, customers:25, revenue:50000, attributable_revenue:40000,
  acquisition_spend:10000, gross_margin_pct:60,
  followup_eligible:100, followup_done:90,
});
assert.equal(k.visitors_to_leads_pct,5);
assert.equal(k.lead_to_customer_pct,5);
assert.equal(k.cpl,20);
assert.equal(k.cac,400);
assert.equal(k.average_ticket,2000);
assert.equal(k.roas,4);
assert.equal(k.followup_coverage_pct,90);

const dq=assessDataQuality({});
assert.equal(dq.grade,'C');
assert.equal(dq.can_project_financial,false);

const ordered=orderPriorities([
  {id:'a',impact:'alto',confidence:'alto',urgency:'alto',effort:'baixo'},
  {id:'b',impact:'medio',confidence:'medio',urgency:'medio',effort:'medio'},
]);
assert.equal(ordered[0].id,'a');
assert.equal(ordered[0].order,1);

const blocked=buildTarget({kpi:'lead_to_customer_pct',baseline:5,benchmark:null});
assert.equal(blocked.status,'NEEDS_BENCHMARK_OR_BASELINE');

const target=buildTarget({
  kpi:'lead_to_customer_pct',
  baseline:5,
  benchmark:{low:7,high:8,source:'estudo-x',date:'2026-09-01',comparability:'mesmo segmento/modelo/canal'},
  horizon_days:90,
});
assert.equal(target.status,'TARGET_RANGE_READY');
assert.deepEqual(target.target_range,{low:7,high:8});

const micro=validateMicroAction({
  title:'Follow-up diário', why:'Reduzir perda', how:'Executar fila',
  frequency:'Diária', owner:'Comercial', example:'10h e 16h',
  leading_kpi:'followup_coverage_pct', business_kpi:'lead_to_customer_pct',
  review_rule:'Revisar em 14 dias'
});
assert.equal(micro.valid,true);

console.log('VOS Intelligence core: OK');
