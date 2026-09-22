/**
 * Contrato da coleta declarada pelo cliente.
 * Não consulta bases, não preenche lacunas e mantém "desconhecido" diferente de zero.
 */
export const VOS_DECLARED_INTAKE_VERSION='VOS_DECLARED_INTAKE_1.0';

export const VOS_DECLARED_METRICS=Object.freeze([
  'revenue','gross_margin_pct','average_ticket','leads','contacted_leads',
  'opportunities','proposals','customers','acquisition_spend','attributable_revenue',
  'response_time_minutes','followup_eligible','followup_done','sales_cycle_days','capacity_monthly',
]);

function clean(value,max=5000){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);}
function number(value){
  if(value==='' || value===null || value===undefined || typeof value==='boolean') return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

export function normalizeDeclaredIntake({company={},metrics={},metric_unknown={}}={}){
  const normalizedCompany={
    segment:clean(company.segment,220),
    business_model:clean(company.business_model,80),
    region:clean(company.region,220),
    channels:(Array.isArray(company.channels)?company.channels:[]).slice(0,12).map(x=>clean(x,120)).filter(Boolean),
    followup_process:clean(company.followup_process,3000),
    business_goal:clean(company.business_goal,3000),
    goal_horizon_days:number(company.goal_horizon_days)??90,
  };
  const unknown={};
  const normalizedMetrics={metric_period:clean(metrics.metric_period,60)};
  for(const field of VOS_DECLARED_METRICS){
    unknown[field]=metric_unknown[field]===true;
    normalizedMetrics[field]=unknown[field]?null:number(metrics[field]);
  }
  return {version:VOS_DECLARED_INTAKE_VERSION,company:normalizedCompany,metrics:normalizedMetrics,metric_unknown:unknown};
}

export function validateDeclaredIntake(input={}){
  const errors=[];
  const company=input.company||{};
  const metrics=input.metrics||{};
  const unknown=input.metric_unknown||{};
  for(const field of ['segment','business_model','region']) if(!clean(company[field],220)) errors.push(`missing:company.${field}`);
  const period=String(metrics.metric_period||'');
  const match=period.match(/^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/);
  if(!match) errors.push('invalid:metric_period');
  else if(match[1]>match[2]) errors.push('invalid:metric_period_order');
  for(const field of VOS_DECLARED_METRICS){
    if(unknown[field]===true) continue;
    const value=number(metrics[field]);
    if(value===null) errors.push(`missing_or_invalid:${field}`);
    else if(value<0) errors.push(`negative:${field}`);
  }
  const margin=number(metrics.gross_margin_pct);
  if(unknown.gross_margin_pct!==true && margin!==null && margin>100) errors.push('out_of_range:gross_margin_pct');
  return {valid:errors.length===0,errors};
}

export function buildDeclaredIntake(raw={}){
  const intake=normalizeDeclaredIntake(raw);
  return {...intake,validation:validateDeclaredIntake(intake)};
}
