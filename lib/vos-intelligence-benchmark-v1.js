export const VOS_BENCHMARK_VERSION='VOS_BENCHMARK_1.0';

const REQUIRED=['id','kpi','unit','low','high','segment','business_model','region','channel','source'];

function value(v){
  if(v==='' || v===null || v===undefined || typeof v==='boolean') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function text(v){return String(v??'').trim().toLowerCase();}
function same(a,b){return text(a) && text(a)===text(b);}
function dateValue(v){const ms=Date.parse(String(v||''));return Number.isFinite(ms)?ms:null;}

export function validateBenchmark(benchmark={},as_of=new Date()){
  const errors=[];
  const warnings=[];
  for(const field of REQUIRED){
    if(field==='source') continue;
    if(benchmark[field]===undefined || benchmark[field]===null || String(benchmark[field]).trim()==='') errors.push(`missing:${field}`);
  }
  const low=value(benchmark.low), high=value(benchmark.high);
  if(low===null || high===null) errors.push('invalid:range');
  if(low!==null && high!==null && low>high) errors.push('invalid:range_order');
  const source=benchmark.source||{};
  if(!source.title || !source.url || !source.published_at) errors.push('missing:source');
  const published=dateValue(source.published_at);
  if(source.published_at && published===null) errors.push('invalid:source_date');
  if(published!==null && published>as_of.getTime()) errors.push('invalid:future_source_date');
  if(!value(source.sample_size) && !source.sample_description) warnings.push('warning:sample_unknown');
  if(!benchmark.sales_model) warnings.push('warning:sales_model_unknown');
  if(value(benchmark.ticket_low)===null || value(benchmark.ticket_high)===null) warnings.push('warning:ticket_range_unknown');
  return {valid:errors.length===0,errors,warnings};
}

function ticketOverlap(benchmark,context){
  const bl=value(benchmark.ticket_low), bh=value(benchmark.ticket_high);
  const ticket=value(context.average_ticket);
  if(bl===null || bh===null || ticket===null) return 0;
  return ticket>=Math.min(bl,bh) && ticket<=Math.max(bl,bh) ? 1 : 0;
}

export function scoreComparability(benchmark={},context={}){
  const factors={
    segment:same(benchmark.segment,context.segment)?1:0,
    business_model:same(benchmark.business_model,context.business_model)?1:0,
    region:same(benchmark.region,context.region)?1:0,
    channel:same(benchmark.channel,context.channel)?1:0,
    ticket:ticketOverlap(benchmark,context),
    sales_model:same(benchmark.sales_model,context.sales_model)?1:0,
  };
  const weights={segment:25,business_model:20,region:10,channel:15,ticket:15,sales_model:15};
  const score=Object.entries(factors).reduce((sum,[key,matched])=>sum+matched*weights[key],0);
  return {
    score,
    level:score>=80?'alta':score>=55?'media':'baixa',
    factors,
  };
}

export function scoreReliability(benchmark={},as_of=new Date()){
  const source=benchmark.source||{};
  let score=0;
  if(source.type==='primary') score+=35;
  else if(source.type==='research') score+=28;
  else if(source.type==='platform_aggregate') score+=22;
  else score+=10;
  const sample=value(source.sample_size);
  if(sample>=1000) score+=30; else if(sample>=100) score+=22; else if(sample>=30) score+=14; else if(sample>0) score+=7;
  const published=dateValue(source.published_at);
  if(published!==null){
    const ageDays=Math.max(0,(as_of.getTime()-published)/86400000);
    if(ageDays<=365) score+=25; else if(ageDays<=730) score+=18; else if(ageDays<=1095) score+=10; else score+=4;
  }
  if(source.methodology) score+=10;
  score=Math.min(100,score);
  return {score,level:score>=80?'alta':score>=55?'media':'baixa'};
}

export function rankBenchmarks(benchmarks=[],context={},kpi,as_of=new Date()){
  return benchmarks
    .filter(item=>!kpi || item.kpi===kpi)
    .map(item=>{
      const validation=validateBenchmark(item,as_of);
      const comparability=scoreComparability(item,context);
      const reliability=scoreReliability(item,as_of);
      return {...item,validation,comparability,reliability,selection_score:Number((comparability.score*.65+reliability.score*.35).toFixed(1))};
    })
    .filter(item=>item.validation.valid)
    .sort((a,b)=>b.selection_score-a.selection_score || String(a.id).localeCompare(String(b.id)));
}

export function selectBenchmark(benchmarks=[],context={},kpi,as_of=new Date()){
  const ranked=rankBenchmarks(benchmarks,context,kpi,as_of);
  const selected=ranked.find(item=>item.comparability.level!=='baixa' && item.reliability.level!=='baixa')||null;
  return {
    version:VOS_BENCHMARK_VERSION,
    status:selected?'BENCHMARK_SELECTED':'NEEDS_COMPARABLE_BENCHMARK',
    selected,
    considered:ranked.map(item=>({id:item.id,selection_score:item.selection_score,comparability:item.comparability,reliability:item.reliability})),
  };
}

