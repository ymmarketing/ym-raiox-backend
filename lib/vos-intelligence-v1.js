/**
 * VOS Intelligence Engine 1.0 — núcleo determinístico.
 * Não faz chamadas externas. Não inventa benchmark nem target.
 */
export const VOS_INTELLIGENCE_VERSION = 'VOS_INTELLIGENCE_1.0';

export const PILLARS = Object.freeze({
  AQUISICAO: 'Aquisição',
  POSICIONAMENTO: 'Posicionamento',
  OPERACAO: 'Operação',
});

export const P8 = Object.freeze([
  'Produto',
  'Preço',
  'Praça',
  'Promoção',
  'Pessoas',
  'Processos',
  'Posicionamento',
  'Performance',
]);

export const JOURNEY_STATES = Object.freeze([
  'PAYMENT_PENDING',
  'PAYMENT_APPROVED',
  'INTAKE_STARTED',
  'INTAKE_COMPLETE',
  'EVIDENCE_PROCESSING',
  'DATA_VALIDATED',
  'ANALYSIS_RUNNING',
  'MARKET_RESEARCH_RUNNING',
  'TARGET_BUILDING',
  'REPORT_READY',
  'PLAN_APPROVED',
  'PLAN_ACTIVE',
  'REVIEW_30D',
  'REVIEW_60D',
  'REVIEW_90D',
  'NEEDS_DATA',
]);

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function div(a,b){
  const x=n(a), y=n(b);
  return x!==null && y!==null && y>0 ? x/y : null;
}
function pct(a,b){
  const x=div(a,b);
  return x===null ? null : Number((x*100).toFixed(2));
}
function money(v){
  const x=n(v);
  return x===null ? null : Number(x.toFixed(2));
}
function ratio(v){
  const x=n(v);
  return x===null ? null : Number(x.toFixed(2));
}

/**
 * raw esperado: números do mesmo período.
 * Campos desconhecidos devem vir null/undefined, nunca zero fictício.
 */
export function calculateBusinessKpis(raw = {}) {
  const visits=n(raw.visits);
  const leads=n(raw.leads);
  const opportunities=n(raw.opportunities);
  const proposals=n(raw.proposals);
  const customers=n(raw.customers);
  const revenue=n(raw.revenue);
  const attributableRevenue=n(raw.attributable_revenue);
  const acquisitionSpend=n(raw.acquisition_spend);
  const grossMarginPct=n(raw.gross_margin_pct);
  const followupEligible=n(raw.followup_eligible);
  const followupDone=n(raw.followup_done);
  const contacted=n(raw.contacted_leads);
  const repeatCustomers=n(raw.repeat_customers);
  const activeCustomers=n(raw.active_customers);
  const churnedCustomers=n(raw.churned_customers);

  return {
    visitors_to_leads_pct: pct(leads, visits),
    lead_to_contact_pct: pct(contacted, leads),
    lead_to_opportunity_pct: pct(opportunities, leads),
    opportunity_to_proposal_pct: pct(proposals, opportunities),
    proposal_to_customer_pct: pct(customers, proposals),
    lead_to_customer_pct: pct(customers, leads),
    cpl: money(div(acquisitionSpend, leads)),
    cac: money(div(acquisitionSpend, customers)),
    average_ticket: money(div(revenue, customers)),
    roas: ratio(div(attributableRevenue, acquisitionSpend)),
    gross_margin_value: revenue!==null && grossMarginPct!==null
      ? money(revenue * grossMarginPct / 100)
      : null,
    followup_coverage_pct: pct(followupDone, followupEligible),
    repeat_customer_pct: pct(repeatCustomers, customers),
    churn_pct: pct(churnedCustomers, activeCustomers),
    response_time_minutes: n(raw.response_time_minutes),
    sales_cycle_days: n(raw.sales_cycle_days),
    revenue: money(revenue),
    attributable_revenue: money(attributableRevenue),
    customers,
    leads,
    opportunities,
    proposals,
  };
}

const MANDATORY_GROUPS = Object.freeze({
  company: ['segment','business_model','region','main_offer'],
  financial: ['revenue','average_ticket_or_inputs','gross_margin_pct'],
  acquisition: ['channels','leads','acquisition_spend'],
  sales: ['customers','sales_cycle_days'],
  funnel: ['leads','opportunities','proposals','customers'],
  operations: ['response_time_minutes','followup_process','capacity_monthly'],
  strategy: ['business_goal','goal_horizon_days'],
});

export function assessDataQuality(input = {}) {
  const groups={};
  let present=0, total=0;
  for (const [group, fields] of Object.entries(MANDATORY_GROUPS)) {
    let gp=0;
    for (const field of fields) {
      total += 1;
      const value=input[field];
      const ok=value!==undefined && value!==null && String(value).trim()!=='';
      if(ok){present+=1;gp+=1;}
    }
    groups[group]={
      present:gp,
      total:fields.length,
      coverage_pct:Number((gp/fields.length*100).toFixed(1)),
      missing:fields.filter(field=>{
        const v=input[field];
        return v===undefined || v===null || String(v).trim()==='';
      }),
    };
  }
  const coverage=total ? Number((present/total*100).toFixed(1)) : 0;
  const grade=coverage>=85 ? 'A' : coverage>=60 ? 'B' : 'C';
  const canProjectFinancial=grade==='A' &&
    groups.financial.coverage_pct===100 &&
    groups.funnel.coverage_pct>=75;

  return {
    grade,
    coverage_pct:coverage,
    groups,
    can_build_targets:grade!=='C',
    can_project_financial:canProjectFinancial,
    rule: grade==='C'
      ? 'instrumentar_antes_de_prever'
      : grade==='B'
        ? 'prever_com_limitacoes'
        : 'previsao_habilitada',
  };
}

const LEVEL = Object.freeze({ baixo:1, medio:2, alto:3 });

export function priorityScore({impact='medio', confidence='medio', urgency='medio', effort='medio'}={}) {
  const i=LEVEL[impact]||2;
  const c=LEVEL[confidence]||2;
  const u=LEVEL[urgency]||2;
  const e=LEVEL[effort]||2;
  return Number(((i*c*u)/e).toFixed(2));
}

export function orderPriorities(items = []) {
  return items
    .map((item,index)=>({...item,_input_order:index,priority_score:priorityScore(item)}))
    .sort((a,b)=>b.priority_score-a.priority_score || a._input_order-b._input_order)
    .map((item,index)=>{
      const {_input_order,...rest}=item;
      return {...rest,order:index+1};
    });
}

/**
 * Cria target somente quando baseline e referência validada existem.
 * benchmark deve trazer low/high + source + date + comparability.
 */
export function buildTarget({kpi, baseline, benchmark, horizon_days=90, assumptions=[]}={}) {
  const b=n(baseline);
  const low=n(benchmark?.low);
  const high=n(benchmark?.high);
  const hasSource=Boolean(benchmark?.source && benchmark?.date && benchmark?.comparability);
  if(b===null || low===null || high===null || !hasSource) {
    return {
      kpi:kpi||null,
      status:'NEEDS_BENCHMARK_OR_BASELINE',
      baseline:b,
      horizon_days,
      target_range:null,
      assumptions,
    };
  }
  const targetLow=Math.min(low,high);
  const targetHigh=Math.max(low,high);
  return {
    kpi,
    status:'TARGET_RANGE_READY',
    baseline:b,
    horizon_days,
    target_range:{low:targetLow,high:targetHigh},
    benchmark:{
      source:String(benchmark.source),
      date:String(benchmark.date),
      comparability:String(benchmark.comparability),
    },
    assumptions,
  };
}

export function validateMicroAction(action = {}) {
  const required=[
    'title','why','how','frequency','owner','example',
    'leading_kpi','business_kpi','review_rule'
  ];
  const missing=required.filter(k=>!action[k] || String(action[k]).trim()==='');
  return {
    valid:missing.length===0,
    missing,
    action,
  };
}

export function buildEngineBaseline({company={}, raw_metrics={}}={}) {
  const data_quality=assessDataQuality({...company,...raw_metrics});
  const kpis=calculateBusinessKpis(raw_metrics);
  return {
    engine_version:VOS_INTELLIGENCE_VERSION,
    generated_at:new Date().toISOString(),
    data_quality,
    kpis,
  };
}
