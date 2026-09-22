import {VOS_INTELLIGENCE_VERSION, P8, PILLARS, buildEngineBaseline} from './vos-intelligence-v1.js';
import {RX_TO_VOS, RX_V2_TO_VOS} from './vos-intelligence-mapping-v1.js';

export const VOS_INPUT_CONTRACT_VERSION='VOS_INPUT_1.0';
export const VOS_DIAGNOSTIC_CONTRACT_VERSION='VOS_DIAGNOSTIC_1.0';

const METRIC_ALIASES=Object.freeze({
  METRIC_PERIOD:'metric_period',
  VISITS:'visits',
  REVENUE:'revenue',
  GROSS_MARGIN_PCT:'gross_margin_pct',
  AVERAGE_TICKET:'average_ticket',
  LEADS:'leads',
  CONTACTED_LEADS:'contacted_leads',
  OPPORTUNITIES:'opportunities',
  PROPOSALS:'proposals',
  CUSTOMERS:'customers',
  ACQUISITION_SPEND:'acquisition_spend',
  ATTRIBUTABLE_REVENUE:'attributable_revenue',
  RESPONSE_TIME_MINUTES:'response_time_minutes',
  FOLLOWUP_ELIGIBLE:'followup_eligible',
  FOLLOWUP_DONE:'followup_done',
  SALES_CYCLE_DAYS:'sales_cycle_days',
  CAPACITY_MONTHLY:'capacity_monthly',
});

function clean(value,max=5000){
  return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
}

function present(value){
  return value!==undefined && value!==null && !(typeof value==='string' && value.trim()==='');
}

export function normalizeMetrics(metrics={}){
  const normalized={};
  for(const [key,value] of Object.entries(metrics||{})){
    const canonical=METRIC_ALIASES[key] || key;
    normalized[canonical]=value;
  }
  return normalized;
}

function mappingFor(version){
  if(version==='RX_CANONICO_2.0') return RX_V2_TO_VOS;
  if(version==='RX_CANONICO_1.0') return RX_TO_VOS;
  throw new Error(`Questionário não suportado pelo VOS Intelligence: ${version||'ausente'}`);
}

export function buildEvidenceIndex({questionnaire_version,answers={},complements={}}={}){
  const mapping=mappingFor(questionnaire_version);
  const evidence=[];
  for(const [id,cfg] of Object.entries(mapping)){
    if(!present(answers[id])) continue;
    evidence.push({
      source_id:id,
      text:clean(Array.isArray(answers[id])?answers[id].join(' | '):answers[id]),
      role:cfg.role,
      pillars:[...cfg.pillars],
      ps:[...cfg.ps],
      evidence_type:'declared_answer',
    });
    if(present(complements[id])){
      evidence.push({
        source_id:`${id}C`,
        text:clean(complements[id],3000),
        role:`${cfg.role}_context`,
        pillars:[...cfg.pillars],
        ps:[...cfg.ps],
        evidence_type:'declared_context',
      });
    }
  }
  return evidence;
}

function buildCoverage(evidence){
  const count=(key,value)=>evidence.filter(item=>item[key].includes(value)).length;
  return {
    pillars:Object.values(PILLARS).map(name=>({name,evidence_count:count('pillars',name),status:count('pillars',name)?'evidence_present':'needs_evidence'})),
    ps:P8.map(name=>({name,evidence_count:count('ps',name),status:count('ps',name)?'evidence_present':'needs_evidence'})),
  };
}

export function buildDiagnosticEnvelope({questionnaire_version,business_name,company={},answers={},complements={},metrics={},external_sources=[]}={}){
  const raw_metrics=normalizeMetrics(metrics);
  const normalizedCompany={
    ...company,
    main_offer:company.main_offer || (questionnaire_version==='RX_CANONICO_2.0' ? clean(answers.Q02) : clean(answers.RX07)),
    business_goal:company.business_goal || (questionnaire_version==='RX_CANONICO_2.0' ? clean(answers.Q18) : clean(answers.RX29)),
  };
  const evidence=buildEvidenceIndex({questionnaire_version,answers,complements});
  const sources=[...new Set([
    ...evidence.map(item=>item.source_id),
    ...(external_sources||[]).map(item=>clean(item?.id,40)).filter(Boolean),
  ])];
  return {
    engine_version:VOS_INTELLIGENCE_VERSION,
    input_contract_version:VOS_INPUT_CONTRACT_VERSION,
    diagnostic_contract_version:VOS_DIAGNOSTIC_CONTRACT_VERSION,
    generated_at:new Date().toISOString(),
    questionnaire_version,
    identification:{business_name:clean(business_name,220)},
    company:normalizedCompany,
    ...buildEngineBaseline({company:normalizedCompany,raw_metrics}),
    evidence,
    evidence_coverage:buildCoverage(evidence),
    external_sources:(external_sources||[]).map(item=>({id:clean(item?.id,40),type:clean(item?.type,40),status:clean(item?.status,30)})).filter(item=>item.id),
    allowed_sources:sources,
  };
}

