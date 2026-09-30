// Função pura: usada pelo CDD consultivo. Ausência de dado permanece null, nunca zero.
const amount=(value,max=1e10)=>{
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>max)throw new Error('invalid_number');
  return n;
};
const money=n=>n===null?null:Math.round((n+Number.EPSILON)*100)/100;
const text=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';

export function calculateCdd(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid_inputs');
  const simple={
    revenue:amount(raw.revenue),leads:amount(raw.leads,1e7),customers:amount(raw.customers,1e7),
    ticket:amount(raw.ticket),extra_sales:amount(raw.extra_sales,1e7),
    marketing_spend:amount(raw.marketing_spend),reduction_pct:amount(raw.reduction_pct,100),
    attribution:['YES','PARTIAL','NO','UNKNOWN'].includes(raw.attribution)?raw.attribution:'UNKNOWN'
  };
  if(simple.leads!==null&&simple.customers!==null&&simple.customers>simple.leads)throw new Error('customers_above_leads');
  const tasks=[];
  for(const item of (Array.isArray(raw.tasks)?raw.tasks:[]).slice(0,20)){
    if(!item||typeof item!=='object')continue;
    const name=text(item.name,150),kind=['MANUAL','REWORK'].includes(item.kind)?item.kind:'MANUAL';
    const count=amount(item.weekly_count,1e6),minutes=amount(item.minutes,1e5),hourCost=amount(item.hour_cost,1e6),direct=amount(item.direct_monthly,1e9);
    if(!name&&!count&&!minutes&&!hourCost&&!direct)continue;
    if(!name)throw new Error('task_name_required');
    const hours=count!==null&&minutes!==null?count*minutes*4/60:null;
    tasks.push({name,kind,weekly_count:count,minutes,hour_cost:hourCost,direct_monthly:direct,source:text(item.source,500),monthly_hours:hours===null?null:Math.round(hours*100)/100,monthly_cost:money(hours!==null&&hourCost!==null?hours*hourCost+(direct||0):direct)});
  }
  const costItems=tasks.filter(x=>x.monthly_cost!==null),hourItems=tasks.filter(x=>x.monthly_hours!==null);
  const knownCost=costItems.length?money(costItems.reduce((sum,x)=>sum+x.monthly_cost,0)):null;
  const hours=hourItems.length?Math.round(hourItems.reduce((sum,x)=>sum+x.monthly_hours,0)*100)/100:null;
  const extraRevenue=simple.extra_sales!==null&&simple.ticket!==null?money(simple.extra_sales*simple.ticket):null;
  const after=simple.revenue!==null&&extraRevenue!==null?money(simple.revenue+extraRevenue):null;
  const saving=knownCost!==null&&simple.reduction_pct!==null?money(knownCost*simple.reduction_pct/100):null;
  const gaps=[];
  for(const [key,label] of [['revenue','faturamento mensal'],['leads','novos contatos'],['customers','novos clientes'],['ticket','ticket médio'],['marketing_spend','investimento atual em marketing']])if(simple[key]===null)gaps.push(label);
  if(!tasks.length)gaps.push('tarefas ou retrabalhos mensurados');
  else if(tasks.some(x=>x.monthly_cost===null))gaps.push('custo de parte das tarefas');
  return {inputs:{...simple,tasks},results:{revenue_before:simple.revenue,revenue_after_scenario:after,extra_revenue_scenario:extraRevenue,conversion_rate:simple.leads>0&&simple.customers!==null?Math.round(simple.customers/simple.leads*10000)/100:null,known_operational_cost:knownCost,measured_hours:hours,potential_cost_reduction:saving,marketing_spend_separate:simple.marketing_spend,partial_cost:tasks.some(x=>x.monthly_cost===null),gaps,method:'CDD_INTERNAL_1.0',weeks_per_month:4,disclaimer:'Cenários não são promessa. Receita extra é bruta; economia reduz custo, mas não aumenta faturamento. Investimento em marketing sem atribuição não é prejuízo comprovado.'}};
}
