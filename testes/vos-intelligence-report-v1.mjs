import assert from 'node:assert/strict';
import {generateVosIntelligenceReport} from '../lib/vos-intelligence-report-v1.js';
import {VOS_DECLARED_METRICS} from '../lib/vos-intelligence-intake-v1.js';

const answers=Object.fromEntries(Array.from({length:18},(_,i)=>[`Q${String(i+1).padStart(2,'0')}`,`Resposta ${i+1}`]));
Object.assign(answers,{Q02:'Raio-X Estratégico',Q04:'Pequenos negócios',Q05:'Falta de prioridade',Q09:'Como funciona?',Q14:'Clareza do diagnóstico'});
const metrics=Object.fromEntries(VOS_DECLARED_METRICS.map(key=>[key,null]));metrics.metric_period='2026-08-01/2026-08-31';
const coverageFor=(a,c,m)=>[
  ...Object.keys(a).filter(key=>a[key]!==null&&a[key]!==undefined&&String(a[key]).trim()).map(source_id=>({source_id,use:'context_only',reading:'Fonte considerada no diagnóstico.'})),
  ...Object.keys(c||{}).filter(key=>c[key]!==null&&c[key]!==undefined&&String(c[key]).trim()).map(key=>({source_id:`${key}C`,use:'context_only',reading:'Complemento considerado no diagnóstico.'})),
  ...Object.keys(m||{}).filter(key=>m[key]!==null&&m[key]!==undefined&&String(m[key]).trim()!=='').map(key=>({source_id:key==='metric_period'?'METRIC_PERIOD':`METRIC_${key.toUpperCase()}`,use:'supports_finding',reading:'Métrica considerada no diagnóstico.'})),
];
const base={status:'validar',reading:'Precisa de evidência.',confidence:'a_validar',sources:['Q01']};
const diagnostic={
  contract_version:'VOS_DIAGNOSTIC_1.0',executive_summary:'A empresa precisa instrumentar o funil antes de projetar crescimento.',
  main_bottleneck:{pillar:'Operação',title:'Mensuração',why_it_matters:'Sem baseline não há previsão confiável.',confidence:'forte',sources:['Q01']},
  pillars:['Aquisição','Posicionamento','Operação'].map(name=>({name,...base})),
  ps:['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance'].map(name=>({name,...base})),
  root_hypotheses:[{title:'Dados insuficientes',reading:'A instrumentação é prioritária.',nature:'dado',...base}],
  source_coverage:coverageFor(answers,{},metrics),
  source_observations:[],
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

const ymAnswers={...answers,
  Q02:'Raio-X Estratégico como porta de entrada',Q04:'Pequenas e médias empresas com alguma jornada digital',
  Q05:'Aumentar vendas, organizar dados e melhorar posicionamento',Q06:'Indicação | Instagram | LinkedIn | Principal origem de clientes: Indicação',
  Q07:'Não há volume de demanda para medir',Q08:'Explico pelo WhatsApp e envio o site',Q09:'A pessoa precisa entender o que o Raio-X faz',
  Q10:'WhatsApp, site e redes sociais',Q11:'Geralmente não entro em contato novamente',Q12:'Ainda não gerei confiança nem comuniquei valor',
  Q13:'Instagram | LinkedIn | Site | CRM',Q14:'Clareza e método simples',Q17:'Não prospecto e não tenho rotina de conteúdo',
  Q18:'Criar rotina efetiva e entrada previsível de clientes',
};
const ymMetrics={metric_period:'2026-03-10/2026-09-21',revenue:9000,gross_margin_pct:70,average_ticket:1000,
  leads:3,contacted_leads:3,opportunities:3,proposals:3,customers:0,acquisition_spend:0,attributable_revenue:0,
  response_time_minutes:0,followup_eligible:0,followup_done:0,sales_cycle_days:3,capacity_monthly:50};
const followupDiagnostic={...diagnostic,
  executive_summary:'É preciso fazer follow-up.',
  main_bottleneck:{pillar:'Operação',title:'Ausência de follow-up',why_it_matters:'Os contatos não foram retomados.',confidence:'forte',sources:['Q11']},
  action_signals:['followup_baixo'],
  priorities:[{title:'Fazer follow-up',why:'Os contatos não foram retomados.',pillar:'Operação',ps:['Processos','Performance'],impact:'alto',confidence:'alto',urgency:'alto',effort:'baixo',action_signal:'followup_baixo',sources:['Q11']}],
  source_coverage:coverageFor(ymAnswers,{Q03:'O produto de entrada Raio-X custa R$ 97. Os serviços realizados depois do Raio-X têm valores distintos conforme o escopo.',Q06:'Seis meses de empresa e poucos clientes.',Q17:'Não existe formato contínuo para testar.'},ymMetrics),
};
const ymResult=await generateVosIntelligenceReport({
  business_name:'YM Marketing & Negócios',company:{segment:'Marketing estratégico',business_model:'B2B2C',region:'Brasil',channels:['Indicação'],followup_process:ymAnswers.Q11,business_goal:ymAnswers.Q18,goal_horizon_days:90},
  answers:{...ymAnswers,Q03:'Prefiro informar o valor'},complements:{Q03:'O produto de entrada Raio-X custa R$ 97. Os serviços realizados depois do Raio-X têm valores distintos conforme o escopo.',Q06:'Seis meses de empresa e poucos clientes.',Q17:'Não existe formato contínuo para testar.'},metrics:ymMetrics,links:[],
},{api_key:'test-key',fetch_impl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({id:'resp_ym',status:'completed',output_text:JSON.stringify(followupDiagnostic),usage:{input_tokens:1000,output_tokens:500,input_tokens_details:{cached_tokens:0}}})})});

assert.equal(ymResult.report.data_quality.grade,'A');
assert.equal(ymResult.report.data_quality.decision_sufficiency.overall,'insufficient');
assert.equal(ymResult.report.data_quality.can_build_targets,false);
assert.equal(ymResult.report.kpis.leads_per_30d,0.46);
assert.equal(ymResult.report.strategic_investigation.critical,true);
assert.equal(ymResult.report.strategic_investigation.investigations.length,6);
assert.equal(ymResult.report.strategic_investigation.actions.length,7);
assert.equal(ymResult.report.diagnostic.main_bottleneck.pillar,'Aquisição');
assert.equal(ymResult.report.priorities[0].action_signal,'lead_volume_critical');
assert.ok(ymResult.report.playbook.selected_action_ids.includes('ACT_ICP_001'));
assert.ok(ymResult.report.playbook.selected_action_ids.includes('ACT_ACQUISITION_CYCLE_001'));
assert.ok(!ymResult.report.playbook.selected_action_ids.includes('ACT_FOLLOWUP_001'));
assert.equal(ymResult.report.offer_pricing.entry_price,'R$ 97');
assert.equal(ymResult.report.offer_pricing.downstream_services_have_distinct_prices,true);
assert.match(ymResult.report.offer_pricing.reading,/ticket m[eé]dio de R\$\s*1\.000,00 pertence ao per[ií]odo geral/i);

console.log('VOS Intelligence end-to-end report: OK');
