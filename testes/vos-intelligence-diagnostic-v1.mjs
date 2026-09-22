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
assert.ok(envelope.allowed_sources.includes('METRIC_LEADS'));
assert.equal(envelope.data_quality.decision_sufficiency.overall,'usable');
assert.equal(envelope.evidence_coverage.pillars.length,3);
assert.equal(envelope.evidence_coverage.ps.length,8);

const request=buildDiagnosticRequest(envelope);
assert.equal(request.text.format.type,'json_schema');
assert.equal(request.text.format.strict,true);
assert.equal(request.store,false);
const visualRequest=buildDiagnosticRequest(envelope,{images:[{id:'IMG01',file_id:'file_test',context:'Print da oferta'}]});
assert.equal(visualRequest.input[0].content.some(item=>item.type==='input_image'&&item.file_id==='file_test'),true);
const gatewayVisualRequest=buildDiagnosticRequest(envelope,{images:[{id:'IMG01',image_url:'data:image/jpeg;base64,ZmFrZQ==',context:'Print da oferta'}]});
assert.equal(gatewayVisualRequest.input[0].content.some(item=>item.type==='input_image'&&item.image_url==='data:image/jpeg;base64,ZmFrZQ=='),true);
const linkedRequest=buildDiagnosticRequest({...envelope,external_sources:[{id:'LINK01',type:'client_link',status:'parcial',url:'https://example.com',context:'Página'}]});
assert.equal(linkedRequest.tools.some(tool=>tool.type==='web_search'),true);

const base={status:'validar',reading:'Ainda precisa de evidência.',confidence:'a_validar',sources:['Q11']};
const report={
  contract_version:'VOS_DIAGNOSTIC_1.0',executive_summary:'Resumo',
  main_bottleneck:{pillar:'Operação',title:'Cadência comercial',why_it_matters:'O acompanhamento não está documentado.',confidence:'consistente',sources:['Q11','Q11C']},
  pillars:['Aquisição','Posicionamento','Operação'].map(name=>({name,...base})),
  ps:['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance'].map(name=>({name,...base})),
  root_hypotheses:[{title:'Follow-up irregular',reading:'Pode haver perda de oportunidades.',nature:'hipotese',...base}],
  source_coverage:envelope.allowed_sources.map(source_id=>({source_id,use:'context_only',reading:'Fonte considerada no diagnóstico.'})),
  source_observations:[],
  action_signals:['followup_baixo'],
  priorities:[{title:'Organizar follow-up',why:'Há acompanhamento irregular.',pillar:'Operação',ps:['Processos','Performance'],impact:'alto',confidence:'medio',urgency:'alto',effort:'baixo',action_signal:'followup_baixo',sources:['Q11','Q11C']}],
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

let gatewayUrl='',gatewayBody=null;
const gatewayExecution=await runDiagnosticAnalysis({
  envelope,api_key:'',gateway_key:'gateway-test',model:'gpt-5.6-terra',
  fetch_impl:async(url,options)=>{
    gatewayUrl=url;gatewayBody=JSON.parse(options.body);
    return {ok:true,status:200,text:async()=>JSON.stringify({id:'resp_gateway',status:'completed',output_text:JSON.stringify(report),usage:{input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:0}}})};
  },
});
assert.equal(gatewayUrl,'https://ai-gateway.vercel.sh/v1/responses');
assert.equal(gatewayBody.model,'openai/gpt-5.6-terra');
assert.equal(gatewayExecution.audit.provider,'vercel_ai_gateway');

const linkedEnvelope=buildDiagnosticEnvelope({
  questionnaire_version:'RX_CANONICO_2.0',business_name:'YM',company,metrics,
  answers:{Q01:'Consultoria estratégica',Q02:'Raio-X',Q03:'R$ 97',Q06:['Indicação','Instagram'],Q11:'Às vezes lembro e chamo',Q18:'Vendas recorrentes'},
  complements:{Q11:'Não existe cadência documentada.'},
  external_sources:[{id:'LINK01',type:'client_link',status:'inacessivel',url:'https://example.com',context:'Perfil informado',content:''}],
});
const linkedReport=structuredClone(report);
linkedReport.source_coverage=linkedEnvelope.allowed_sources.map(source_id=>({source_id,use:'context_only',reading:'Fonte considerada no diagnóstico.'}));
linkedReport.source_observations=[{source_id:'LINK01',access_status:'analisado',evidence_basis:'web_search',observation:'Perfil claro.',implication:'Ajuda a oferta.',recommended_change:'Manter.',confidence:'a_validar'}];
const guardedExecution=await runDiagnosticAnalysis({
  envelope:linkedEnvelope,api_key:'test-key',
  fetch_impl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({id:'resp_guard',status:'completed',output_text:JSON.stringify(linkedReport),usage:{input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:0}}})}),
});
assert.equal(guardedExecution.diagnostic.source_observations[0].access_status,'inacessivel');
assert.equal(guardedExecution.diagnostic.source_observations[0].evidence_basis,'declared_context');

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
