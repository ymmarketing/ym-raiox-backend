import assert from 'node:assert/strict';
import {assessDataQuality, calculateBusinessKpis} from '../lib/vos-intelligence-v1.js';
import {RX_V2_TO_VOS} from '../lib/vos-intelligence-mapping-v1.js';
import {buildDiagnosticEnvelope} from '../lib/vos-intelligence-contract-v1.js';
import {buildDiagnosticRequest, runDiagnosticAnalysis, validateDiagnosticReport} from '../lib/vos-intelligence-diagnostic-v1.js';

assert.equal(Object.keys(RX_V2_TO_VOS).length,18);

const metrics={
  METRIC_PERIOD:'2026-08-01/2026-08-31',REVENUE:10000,GROSS_MARGIN_PCT:60,
  LEADS:40,OPPORTUNITIES:15,PROPOSALS:10,CUSTOMERS:5,ACQUISITION_SPEND:500,
  RESPONSE_TIME_MINUTES:120,FOLLOWUP_ELIGIBLE:10,FOLLOWUP_DONE:8,
  SALES_CYCLE_DAYS:14,CAPACITY_MONTHLY:10,
};
const company={segment:'Consultoria',business_model:'B2B',region:'Brasil',channels:['Indicação'],followup_process:'Manual',goal_horizon_days:90};
const envelope=buildDiagnosticEnvelope({
  questionnaire_version:'RX_CANONICO_2.0',business_name:'YM',company,metrics,
  answers:{Q01:'Consultoria estratégica',Q02:'Raio-X',Q03:'R$ 97',Q06:['Indicação','Instagram'],Q11:'Às vezes lembro e chamo',Q18:'Vendas recorrentes'},
  complements:{Q11:'Não existe cadência documentada.'},
});
assert.equal(envelope.data_quality.grade,'A');
assert.equal(envelope.kpis.lead_to_customer_pct,12.5);
assert.equal(envelope.kpis.average_ticket,2000);
assert.ok(envelope.allowed_sources.includes('Q11C'));
assert.equal(envelope.evidence_coverage.pillars.length,3);
assert.equal(envelope.evidence_coverage.ps.length,8);

const request=buildDiagnosticRequest(envelope);
assert.equal(request.text.format.type,'json_schema');
assert.equal(request.text.format.strict,true);
assert.equal(request.store,false);

const base={status:'validar',reading:'Ainda precisa de evidência.',confidence:'a_validar',sources:['Q11']};
const report={
  contract_version:'VOS_DIAGNOSTIC_1.0',executive_summary:'Resumo',
  main_bottleneck:{pillar:'Operação',title:'Cadência comercial',why_it_matters:'O acompanhamento não está documentado.',confidence:'consistente',sources:['Q11','Q11C']},
  pillars:['Aquisição','Posicionamento','Operação'].map(name=>({name,...base})),
  ps:['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance'].map(name=>({name,...base})),
  root_hypotheses:[{title:'Follow-up irregular',reading:'Pode haver perda de oportunidades.',nature:'hipotese',...base}],
  not_assertable:['Não há benchmark validado.'],
};
assert.equal(validateDiagnosticReport(report,envelope).valid,true);
report.ps[0].sources=['FONTE_INVENTADA'];
const invalid=validateDiagnosticReport(report,envelope);
assert.equal(invalid.valid,false);
assert.deepEqual(invalid.invalid_sources,['FONTE_INVENTADA']);
report.ps[0].sources=['Q11'];

const execution=await runDiagnosticAnalysis({
  envelope,api_key:'test-key',
  fetch_impl:async()=>({
    ok:true,status:200,
    text:async()=>JSON.stringify({
      id:'resp_test',status:'completed',output_text:JSON.stringify(report),
      usage:{input_tokens:1200,output_tokens:800,input_tokens_details:{cached_tokens:200}},
    }),
  }),
});
assert.equal(execution.audit.response_id,'resp_test');
assert.equal(execution.audit.input_tokens,1200);
assert.equal(execution.diagnostic.main_bottleneck.pillar,'Operação');

await assert.rejects(()=>runDiagnosticAnalysis({
  envelope,api_key:'test-key',
  fetch_impl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({status:'incomplete'})}),
}),/OPENAI_RESPONSE_INCOMPLETE/);

const bad=assessDataQuality({...company,...metrics,metric_period:metrics.METRIC_PERIOD,gross_margin_pct:140});
assert.equal(bad.grade,'C');
assert.equal(bad.errors.some(x=>x.code==='PERCENTAGE_OUT_OF_RANGE'),true);

const kpis=calculateBusinessKpis({revenue:'',customers:'',average_ticket:280});
assert.equal(kpis.average_ticket,280);
assert.equal(kpis.revenue,null);

console.log('VOS Intelligence diagnostic contract: OK');
