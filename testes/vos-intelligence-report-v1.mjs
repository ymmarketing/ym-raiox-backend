import assert from 'node:assert/strict';
import {generateVosIntelligenceReport} from '../lib/vos-intelligence-report-v1.js';
import {VOS_DECLARED_METRICS} from '../lib/vos-intelligence-intake-v1.js';

const answers=Object.fromEntries(Array.from({length:18},(_,i)=>[`Q${String(i+1).padStart(2,'0')}`,`Resposta ${i+1}`]));
Object.assign(answers,{Q02:'Raio-X Estratégico',Q04:'Pequenos negócios',Q05:'Falta de prioridade',Q09:'Como funciona?',Q14:'Clareza do diagnóstico'});
const metrics=Object.fromEntries(VOS_DECLARED_METRICS.map(key=>[key,null]));metrics.metric_period='2026-08-01/2026-08-31';
const base={status:'validar',reading:'Precisa de evidência.',confidence:'a_validar',sources:['Q01']};
const diagnostic={
  contract_version:'VOS_DIAGNOSTIC_1.0',executive_summary:'A empresa precisa instrumentar o funil antes de projetar crescimento.',
  main_bottleneck:{pillar:'Operação',title:'Mensuração',why_it_matters:'Sem baseline não há previsão confiável.',confidence:'forte',sources:['Q01']},
  pillars:['Aquisição','Posicionamento','Operação'].map(name=>({name,...base})),
  ps:['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance'].map(name=>({name,...base})),
  root_hypotheses:[{title:'Dados insuficientes',reading:'A instrumentação é prioritária.',nature:'dado',...base}],
  action_signals:['dados_insuficientes'],
  priorities:[{title:'Instrumentar o funil',why:'Faltam números declarados.',pillar:'Operação',ps:['Processos','Performance'],impact:'alto',confidence:'alto',urgency:'alto',effort:'baixo',action_signal:'dados_insuficientes',sources:['Q01']}],
  not_assertable:['Não há baseline financeiro completo.'],
};
const result=await generateVosIntelligenceReport({
  business_name:'YM',company:{segment:'Marketing',business_model:'B2B',region:'Brasil',channels:['Indicação'],followup_process:'Manual',business_goal:'Crescer',goal_horizon_days:90},
  answers,complements:{},metrics,links:[],
},{api_key:'test-key',fetch_impl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({id:'resp_vos',status:'completed',output_text:JSON.stringify(diagnostic),usage:{input_tokens:1000,output_tokens:500,input_tokens_details:{cached_tokens:0}}})})});

assert.equal(result.report.report_version,'VOS_REPORT_1.0');
assert.equal(result.report.data_policy.historical_databases_used,false);
assert.equal(result.report.data_quality.grade,'C');
assert.equal(result.report.targets.revenue.status,'TARGET_BLOCKED');
assert.ok(result.report.playbook.selected_action_ids.includes('ACT_TRACKING_001'));
assert.equal(result.report.content_week.status,'CONTENT_WEEK_READY');

console.log('VOS Intelligence end-to-end report: OK');
