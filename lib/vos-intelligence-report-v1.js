import {buildDiagnosticEnvelope} from './vos-intelligence-contract-v1.js';
import {runDiagnosticAnalysis} from './vos-intelligence-diagnostic-v1.js';
import {orderPriorities} from './vos-intelligence-v1.js';
import {buildTargetTrajectory} from './vos-intelligence-target-v1.js';
import {buildContentWeek,buildPlaybook} from './vos-intelligence-playbook-v1.js';
import {ACTION_LIBRARY} from './vos-intelligence-actions-v1.js';
import {fetchPublicLink} from './raiox-v2-report-v22.js';
import {applyAcquisitionGuard,buildAcquisitionInvestigation} from './vos-intelligence-investigation-v1.js';

export const VOS_REPORT_VERSION='VOS_REPORT_1.0';
export const VOS_REPORT_MODEL=process.env.OPENAI_VOS_MODEL||process.env.OPENAI_RAIOX_MODEL||'gpt-5.6-terra';

const PRICING={
  'gpt-5.6-terra':{input:2,output:12},'gpt-5.6-sol':{input:4,output:20},
  'gpt-5.6':{input:4,output:20},'gpt-5.6-luna':{input:.2,output:1.2},
  'gpt-5.4-mini':{input:.75,output:4.5},'gpt-5-mini':{input:.25,output:2},
};

function estimateCost(audit={}){
  const price=PRICING[audit.model]||PRICING['gpt-5.6-terra'];
  const input=Number(audit.input_tokens||0),cached=Number(audit.cached_input_tokens||0),output=Number(audit.output_tokens||0);
  const total=((Math.max(0,input-cached)*price.input)+(cached*price.input*.1)+(output*price.output))/1_000_000;
  return {model:audit.model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,web_search_calls:0,token_cost_usd:Number(total.toFixed(6)),tool_cost_usd:0,estimated_total_usd:Number(total.toFixed(6))};
}

function targetMap(envelope){
  const result={};
  const businessKpis=[...new Set(ACTION_LIBRARY.flatMap(action=>action.business_kpis))];
  for(const kpi of businessKpis){
    result[kpi]=buildTargetTrajectory({
      kpi,baseline:envelope.kpis[kpi],data_quality:envelope.data_quality,
      benchmark_selection:{status:'NEEDS_COMPARABLE_BENCHMARK',selected:null},impact_estimate:null,
      capacity_monthly:envelope.kpis.capacity_monthly,average_ticket:envelope.kpis.average_ticket,
      assumptions:['Nenhuma base histórica foi consultada.','A meta permanece bloqueada até existir benchmark comparável e fonte de impacto validada.'],
    });
  }
  return result;
}

export async function generateVosIntelligenceReport(intake,{fetch_impl=globalThis.fetch,api_key=process.env.OPENAI_API_KEY||''}={}){
  const linkAudit=await Promise.all((intake.links||[]).slice(0,8).map(fetchPublicLink));
  const externalSources=[
    ...linkAudit.map(link=>({id:link.id,type:'client_link',status:link.status,url:link.url,content:link.content,context:(intake.links||[]).find(item=>item.id===link.id)?.context||''})),
    ...(intake.images||[]).map(image=>({id:image.id,type:'client_image',status:'attached',context:image.context||''})),
  ];
  const envelope=buildDiagnosticEnvelope({
    questionnaire_version:'RX_CANONICO_2.0',business_name:intake.business_name,
    company:intake.company,answers:intake.answers,complements:intake.complements,metrics:intake.metrics,
    external_sources:externalSources,
  });
  const analysis=await runDiagnosticAnalysis({envelope,model:VOS_REPORT_MODEL,fetch_impl,api_key,images:intake.images||[]});
  const investigation=buildAcquisitionInvestigation(intake);
  const diagnostic=applyAcquisitionGuard(analysis.diagnostic,investigation);
  const signals=[...new Set([...(diagnostic.action_signals||[]),...(envelope.data_quality.grade==='C'?['dados_insuficientes']:[])])];
  let priorities=orderPriorities(diagnostic.priorities||[]).slice(0,3);
  if(investigation.critical){
    const primary=priorities.find(item=>item.action_signal==='lead_volume_critical');
    if(primary) priorities=[primary,...priorities.filter(item=>item!==primary)].map((item,index)=>({...item,order:index+1}));
  }
  const main=priorities[0]||{pillar:diagnostic.main_bottleneck.pillar,ps:[]};
  const targets=targetMap(envelope);
  const playbook=buildPlaybook({pillar:main.pillar,ps:main.ps||[],signals,targets});
  const content_week=buildContentWeek({
    offer:intake.answers.Q02,audience:intake.answers.Q04,problem:intake.answers.Q05,
    proof:intake.answers.Q14,objection:intake.answers.Q09,
    cta:'Responda à chamada com o próximo passo indicado pela empresa.',
  });
  return {
    report:{
      report_version:VOS_REPORT_VERSION,
      generated_at:new Date().toISOString(),
      business_name:intake.business_name,
      executive_summary:diagnostic.executive_summary,
      data_policy:{historical_databases_used:false,input_origin:'client_declared_in_current_questionnaire',unknown_values_inferred:false},
      data_quality:envelope.data_quality,
      kpis:envelope.kpis,
      diagnostic,
      strategic_investigation:investigation,
      priorities,
      targets,
      playbook,
      content_week,
      source_analysis:{
        links:linkAudit.map(({content,...link})=>link),
        images:(intake.images||[]).map(image=>({id:image.id,name:image.name,status:'analisado_na_execucao'})),
        coverage:diagnostic.source_coverage||[],
        observations:diagnostic.source_observations||[],
      },
      declared_period:intake.metrics.metric_period,
    },
    cost:estimateCost(analysis.audit),
    audit:analysis.audit,
  };
}
