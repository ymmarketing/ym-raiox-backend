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
  const model=String(audit.model||'').replace(/^openai\//,'');
  const price=PRICING[model]||PRICING['gpt-5.6-terra'];
  const input=Number(audit.input_tokens||0),cached=Number(audit.cached_input_tokens||0),output=Number(audit.output_tokens||0);
  const total=((Math.max(0,input-cached)*price.input)+(cached*price.input*.1)+(output*price.output))/1_000_000;
  const webSearchCalls=Number(audit.web_search_calls||0);
  const toolCost=webSearchCalls*.01;
  return {provider:audit.provider||null,model:audit.model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,web_search_calls:webSearchCalls,token_cost_usd:Number(total.toFixed(6)),tool_cost_usd:Number(toolCost.toFixed(6)),estimated_total_usd:Number((total+toolCost).toFixed(6))};
}

function firstCurrency(value){
  const match=String(value||'').match(/R\$\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|R\$\s*\d+(?:,\d{1,2})?/i);
  return match ? match[0].replace(/\s+/g,' ').trim() : null;
}

function offerLabel(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  return (text.split(/,|;|\s+como produto\s+/i)[0]||'Oferta principal').trim();
}

function buildOfferPricing(intake,envelope){
  const selection=String(intake?.answers?.Q03||'').trim();
  const context=String(intake?.complements?.Q03||'').replace(/\s+/g,' ').trim();
  const entry_offer=offerLabel(intake?.answers?.Q02);
  const entry_price=firstCurrency(context)||selection||null;
  const distinct_aftercare=/servi[cç]os?.{0,80}(?:posterior|depois|p[oó]s|distint|diferent|escopo)|(?:posterior|depois|p[oó]s).{0,80}servi[cç]os?/i.test(context);
  const average_ticket=Number.isFinite(Number(envelope?.kpis?.average_ticket))?Number(envelope.kpis.average_ticket):null;
  const money=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const parts=[];
  if(entry_price) parts.push(`${entry_offer} é o produto de entrada, com valor declarado de ${entry_price}.`);
  else parts.push(`${entry_offer} foi informado como produto de entrada, sem valor numérico identificável no contexto.`);
  if(distinct_aftercare) parts.push('Os serviços realizados depois do diagnóstico têm valores distintos conforme o escopo.');
  else if(context) parts.push(`Contexto declarado sobre preços: ${context}`);
  if(average_ticket!==null) parts.push(`O ticket médio de ${money(average_ticket)} pertence ao período geral informado e não deve ser interpretado como o preço do produto de entrada.`);
  return {
    entry_offer,
    entry_price,
    selection:selection||null,
    downstream_services_have_distinct_prices:distinct_aftercare,
    declared_context:context||null,
    average_ticket,
    reading:parts.join(' '),
    sources:['Q02','Q03',...(context?['Q03C']:[]),...(average_ticket!==null?['METRIC_AVERAGE_TICKET']:[])],
  };
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
    ...(intake.images||[]).map(image=>({
      id:image.id,
      type:'client_image',
      status:'attached',
      context:[
        image.channel?`Canal ou material: ${image.channel}.`:'',
        image.visible_content_count!==null&&image.visible_content_count!==undefined?`Conteúdos visíveis declarados no print: ${image.visible_content_count}.`:'',
        image.context||'',
      ].filter(Boolean).join(' '),
    })),
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
    signals,
  });
  const sourceObservationById=new Map((diagnostic.source_observations||[]).map(item=>[item.source_id,item]));
  return {
    report:{
      report_version:VOS_REPORT_VERSION,
      generated_at:new Date().toISOString(),
      business_name:intake.business_name,
      executive_summary:diagnostic.executive_summary,
      data_policy:{historical_databases_used:false,input_origin:'client_declared_in_current_questionnaire',unknown_values_inferred:false},
      data_quality:envelope.data_quality,
      kpis:envelope.kpis,
      offer_pricing:buildOfferPricing(intake,envelope),
      diagnostic,
      strategic_investigation:investigation,
      priorities,
      targets,
      playbook,
      content_week,
      source_analysis:{
        links:linkAudit.map(({content,...link})=>{
          const observation=sourceObservationById.get(link.id);
          return {...link,ai_access_status:observation?.access_status||link.status,evidence_basis:observation?.evidence_basis||'declared_context'};
        }),
        images:(intake.images||[]).map(image=>{
          const observation=sourceObservationById.get(image.id);
          return {id:image.id,name:image.name,channel:image.channel||null,visible_content_count:image.visible_content_count??null,status:observation?.access_status||'parcial',evidence_basis:observation?.evidence_basis||'visual_analysis'};
        }),
        coverage:diagnostic.source_coverage||[],
        observations:diagnostic.source_observations||[],
        audit:{provider:analysis.audit.provider,model:analysis.audit.model,gateway_fallback_status:analysis.audit.gateway_fallback_status||null,web_search_calls:analysis.audit.web_search_calls,links_received:linkAudit.length,images_received:(intake.images||[]).length},
      },
      declared_period:intake.metrics.metric_period,
    },
    cost:estimateCost(analysis.audit),
    audit:analysis.audit,
  };
}
