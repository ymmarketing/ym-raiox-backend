export const VOS_TARGET_VERSION='VOS_TARGET_1.0';

function number(v){
  if(v==='' || v===null || v===undefined || typeof v==='boolean') return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function round(v){return Number(Number(v).toFixed(2));}
function interpolate(base,target,factor){return round(base+(target-base)*factor);}
function confidenceLabel(score){return score>=80?'alta':score>=60?'media':'baixa';}

function applyCapacity({kpi,range,capacity_monthly,average_ticket}){
  const capacity=number(capacity_monthly),ticket=number(average_ticket);
  if(capacity===null) return {range,limited:false,reason:null};
  let ceiling=null;
  if(kpi==='customers') ceiling=capacity;
  if(kpi==='revenue' && ticket!==null) ceiling=capacity*ticket;
  if(ceiling===null) return {range,limited:false,reason:null};
  const next={low:Math.min(range.low,ceiling),high:Math.min(range.high,ceiling)};
  return {range:next,limited:next.low!==range.low || next.high!==range.high,reason:'capacity_monthly'};
}

export function calculateTargetConfidence({data_quality_grade,benchmark,impact_estimate}={}){
  const dq=data_quality_grade==='A'?40:data_quality_grade==='B'?25:0;
  const comparability=Math.min(30,Math.max(0,number(benchmark?.comparability?.score)||0)*.30);
  const reliability=Math.min(20,Math.max(0,number(benchmark?.reliability?.score)||0)*.20);
  const impact=impact_estimate?.source && impact_estimate?.basis ? 10 : 0;
  const raw=round(dq+comparability+reliability+impact);
  const score=data_quality_grade==='A' ? raw : data_quality_grade==='B' ? Math.min(79,raw) : Math.min(49,raw);
  return {score,level:confidenceLabel(score),components:{data_quality:dq,comparability:round(comparability),reliability:round(reliability),impact_evidence:impact}};
}

function finalRange({baseline,unit,impact_estimate,benchmark}){
  const low=number(impact_estimate?.low),high=number(impact_estimate?.high);
  if(low===null || high===null) return null;
  let targetLow,targetHigh;
  if(unit==='percent_change'){
    targetLow=baseline*(1+Math.min(low,high)/100);
    targetHigh=baseline*(1+Math.max(low,high)/100);
  }else{
    targetLow=baseline+Math.min(low,high);
    targetHigh=baseline+Math.max(low,high);
  }
  const bLow=number(benchmark?.low),bHigh=number(benchmark?.high);
  if(bLow!==null && bHigh!==null){
    targetLow=Math.min(targetLow,Math.max(bLow,bHigh));
    targetHigh=Math.min(targetHigh,Math.max(bLow,bHigh));
  }
  return {low:round(Math.max(0,targetLow)),high:round(Math.max(0,targetHigh))};
}

export function buildTargetTrajectory({
  kpi,baseline,unit='percent_change',data_quality,benchmark_selection,impact_estimate,
  capacity_monthly=null,average_ticket=null,trajectory_factors={30:.35,60:.70,90:1},assumptions=[],
}={}){
  const base=number(baseline);
  const benchmark=benchmark_selection?.selected||null;
  const blockers=[];
  if(base===null) blockers.push('baseline');
  if(!data_quality || data_quality.grade==='C') blockers.push('data_quality');
  if(!benchmark || benchmark_selection?.status!=='BENCHMARK_SELECTED') blockers.push('benchmark');
  if(number(impact_estimate?.low)===null || number(impact_estimate?.high)===null || !impact_estimate?.source || !impact_estimate?.basis) blockers.push('impact_estimate');
  if(blockers.length){
    return {version:VOS_TARGET_VERSION,kpi:kpi||null,status:'TARGET_BLOCKED',baseline:base,blockers,target_30d:null,target_60d:null,target_90d:null};
  }
  const final=finalRange({baseline:base,unit,impact_estimate,benchmark});
  const makeRange=factor=>({low:interpolate(base,final.low,factor),high:interpolate(base,final.high,factor)});
  const c30=applyCapacity({kpi,range:makeRange(number(trajectory_factors[30])??.35),capacity_monthly,average_ticket});
  const c60=applyCapacity({kpi,range:makeRange(number(trajectory_factors[60])??.70),capacity_monthly,average_ticket});
  const c90=applyCapacity({kpi,range:makeRange(number(trajectory_factors[90])??1),capacity_monthly,average_ticket});
  const confidence=calculateTargetConfidence({data_quality_grade:data_quality.grade,benchmark,impact_estimate});
  return {
    version:VOS_TARGET_VERSION,kpi,status:'TARGET_TRAJECTORY_READY',baseline:base,unit,
    target_30d:c30.range,target_60d:c60.range,target_90d:c90.range,
    confidence,
    capacity_guard:{limited:c30.limited||c60.limited||c90.limited,reason:c90.reason},
    benchmark:{id:benchmark.id,source:benchmark.source,comparability:benchmark.comparability,reliability:benchmark.reliability},
    impact_estimate:{low:number(impact_estimate.low),high:number(impact_estimate.high),source:impact_estimate.source,basis:impact_estimate.basis},
    assumptions:[
      ...assumptions,
      `Trajetória de maturação aplicada: 30d=${trajectory_factors[30]}, 60d=${trajectory_factors[60]}, 90d=${trajectory_factors[90]}.`,
      'A faixa é uma expectativa condicionada, não uma garantia.',
    ],
  };
}
