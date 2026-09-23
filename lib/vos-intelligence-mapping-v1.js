/**
 * Ponte do Raio-X atual (RX01..RX30) para o VOS Intelligence 1.0.
 * Os 8 Ps oficiais aqui são: Produto, Preço, Praça, Promoção,
 * Pessoas, Processos, Posicionamento e Performance.
 */
export const RX_TO_VOS_MAP_VERSION='RX_TO_VOS_1.0';

export const RX_TO_VOS = Object.freeze({
  RX03:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'context'},
  RX04:{ps:['Praça','Processos'],pillars:['Aquisição','Operação'],role:'context'},
  RX06:{ps:['Praça','Promoção','Performance'],pillars:['Aquisição','Posicionamento'],role:'evidence'},
  RX07:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'offer'},
  RX08:{ps:['Produto','Posicionamento'],pillars:['Aquisição','Posicionamento'],role:'icp'},
  RX09:{ps:['Produto'],pillars:['Posicionamento','Operação'],role:'structure'},
  RX10:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'clarity'},
  RX11:{ps:['Preço'],pillars:['Posicionamento','Operação'],role:'pricing'},
  RX12:{ps:['Preço','Posicionamento'],pillars:['Posicionamento'],role:'value_perception'},
  RX13:{ps:['Praça','Performance'],pillars:['Aquisição'],role:'attribution'},
  RX14:{ps:['Praça','Processos'],pillars:['Aquisição','Operação'],role:'purchase_path'},
  RX15:{ps:['Promoção'],pillars:['Aquisição','Posicionamento'],role:'communication_cadence'},
  RX16:{ps:['Promoção','Posicionamento'],pillars:['Posicionamento','Aquisição'],role:'message_clarity'},
  RX17:{ps:['Pessoas','Processos'],pillars:['Operação'],role:'responsibility'},
  RX18:{ps:['Pessoas','Processos'],pillars:['Operação'],role:'capacity_dependency'},
  RX19:{ps:['Processos'],pillars:['Operação'],role:'sales_process'},
  RX20:{ps:['Pessoas','Processos','Performance'],pillars:['Operação'],role:'followup_loss'},
  RX21:{ps:['Posicionamento','Produto'],pillars:['Posicionamento'],role:'proof_asset'},
  RX22:{ps:['Posicionamento','Promoção'],pillars:['Posicionamento'],role:'proof_visibility'},
  RX23:{ps:['Performance'],pillars:['Operação','Aquisição'],role:'metrics_management'},
  RX24:{ps:['Performance','Processos'],pillars:['Operação'],role:'records'},
  RX25:{ps:['Pessoas','Processos','Performance'],pillars:['Operação'],role:'capacity'},
  RX26:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'patrimony'},
  RX27:{ps:['Performance'],pillars:['Aquisição','Posicionamento','Operação'],role:'declared_problem'},
  RX28:{ps:['Performance','Processos'],pillars:['Aquisição','Posicionamento','Operação'],role:'attempts'},
  RX29:{ps:['Performance'],pillars:['Aquisição','Posicionamento','Operação'],role:'goal'},
  RX30:{ps:['Performance'],pillars:['Aquisição','Posicionamento','Operação'],role:'success_signal'},
});

/** Mapeamento do questionário efetivamente liberado após o pagamento (Q01..Q18). */
export const RX_V2_TO_VOS = Object.freeze({
  Q01:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'business_context'},
  Q02:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'main_offer'},
  Q03:{ps:['Preço'],pillars:['Posicionamento','Operação'],role:'price'},
  Q04:{ps:['Produto','Posicionamento'],pillars:['Aquisição','Posicionamento'],role:'customer_profile'},
  Q05:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'customer_problem'},
  Q06:{ps:['Praça','Promoção','Performance'],pillars:['Aquisição'],role:'acquisition_channels'},
  Q07:{ps:['Praça','Processos','Performance'],pillars:['Aquisição','Operação'],role:'first_step'},
  Q08:{ps:['Praça','Processos'],pillars:['Aquisição','Operação'],role:'sales_journey'},
  Q09:{ps:['Produto','Preço','Posicionamento'],pillars:['Posicionamento','Operação'],role:'objections'},
  Q10:{ps:['Produto','Preço','Promoção','Posicionamento'],pillars:['Posicionamento','Operação'],role:'offer_presentation'},
  Q11:{ps:['Pessoas','Processos','Performance'],pillars:['Operação'],role:'followup'},
  Q12:{ps:['Processos','Performance'],pillars:['Aquisição','Operação'],role:'funnel_loss'},
  Q13:{ps:['Praça','Promoção','Processos','Posicionamento'],pillars:['Aquisição','Posicionamento','Operação'],role:'assets'},
  Q14:{ps:['Produto','Posicionamento'],pillars:['Posicionamento'],role:'differentiation'},
  Q15:{ps:['Pessoas','Processos'],pillars:['Operação'],role:'team'},
  Q16:{ps:['Pessoas','Processos','Performance'],pillars:['Operação'],role:'capacity'},
  Q17:{ps:['Promoção','Processos','Performance'],pillars:['Aquisição','Posicionamento','Operação'],role:'attempts'},
  Q18:{ps:['Performance'],pillars:['Aquisição','Posicionamento','Operação'],role:'goal_90d'},
});

export const NUMERIC_DATA_CONTRACT = Object.freeze([
  {
    id:'METRIC_PERIOD',
    label:'Período de referência dos números',
    required:true,
    reason:'Todos os KPIs precisam usar o mesmo período.',
    example:'Últimos 30 dias'
  },
  {
    id:'REVENUE',
    label:'Faturamento no período',
    required:true,
    reason:'Cria baseline financeiro e permite medir ganho incremental.'
  },
  {
    id:'GROSS_MARGIN_PCT',
    label:'Margem bruta aproximada (%)',
    required_for_financial_projection:true,
    reason:'Evita recomendar crescimento que destrua margem.'
  },
  {
    id:'AVERAGE_TICKET',
    label:'Ticket médio',
    required:true,
    can_calculate_from:['REVENUE','CUSTOMERS'],
    reason:'Conecta vendas a impacto financeiro.'
  },
  {
    id:'LEADS',
    label:'Leads/contatos comerciais recebidos',
    required:true,
    reason:'Base do funil e do CAC.'
  },
  {
    id:'CONTACTED_LEADS',
    label:'Leads efetivamente contatados',
    required:false,
    reason:'Mostra perda entre entrada e primeiro atendimento.'
  },
  {
    id:'OPPORTUNITIES',
    label:'Oportunidades qualificadas',
    required:true,
    reason:'Separa volume de lead de oportunidade real.'
  },
  {
    id:'PROPOSALS',
    label:'Propostas/orçamentos enviados',
    required:true,
    reason:'Permite localizar vazamento na etapa comercial.'
  },
  {
    id:'CUSTOMERS',
    label:'Novos clientes/vendas fechadas',
    required:true,
    reason:'Resultado comercial do período.'
  },
  {
    id:'ACQUISITION_SPEND',
    label:'Investimento em aquisição',
    required:true,
    allow_zero:true,
    reason:'Necessário para CPL/CAC quando houver investimento.'
  },
  {
    id:'ATTRIBUTABLE_REVENUE',
    label:'Receita atribuível aos canais acompanhados',
    required:false,
    reason:'Necessária para ROAS quando a atribuição for confiável.'
  },
  {
    id:'RESPONSE_TIME_MINUTES',
    label:'Tempo médio de primeira resposta (minutos)',
    required_for_operations_target:true,
    reason:'É um KPI líder de contato/conversão.'
  },
  {
    id:'FOLLOWUP_ELIGIBLE',
    label:'Oportunidades que exigiam follow-up',
    required_for_operations_target:true,
    reason:'Cria denominador real da cobertura de follow-up.'
  },
  {
    id:'FOLLOWUP_DONE',
    label:'Oportunidades com follow-up executado',
    required_for_operations_target:true,
    reason:'Mede disciplina operacional.'
  },
  {
    id:'SALES_CYCLE_DAYS',
    label:'Ciclo médio de vendas (dias)',
    required:true,
    reason:'Define horizonte realista para observar efeito das ações.'
  },
  {
    id:'CAPACITY_MONTHLY',
    label:'Capacidade mensal máxima aproximada',
    required:true,
    reason:'Impede target acima da capacidade de entrega.'
  }
]);

export function coverageByP8(answers={}){
  const out={};
  for(const p of ['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance']){
    const mapped=Object.entries(RX_TO_VOS).filter(([,cfg])=>cfg.ps.includes(p));
    const present=mapped.filter(([id])=>{
      const v=answers[id];
      return v!==undefined && v!==null && String(v).trim()!=='';
    });
    out[p]={
      mapped_questions:mapped.map(([id])=>id),
      present_questions:present.map(([id])=>id),
      coverage_pct:mapped.length?Number((present.length/mapped.length*100).toFixed(1)):0
    };
  }
  return out;
}

export function missingNumericData(metrics={}){
  return NUMERIC_DATA_CONTRACT.filter(item=>{
    if(!item.required) return false;
    if(item.id==='AVERAGE_TICKET' && metrics.REVENUE!=null && metrics.CUSTOMERS>0) return false;
    const v=metrics[item.id];
    if(item.allow_zero && Number(v)===0) return false;
    return v===undefined || v===null || String(v).trim()==='';
  }).map(x=>({id:x.id,label:x.label,reason:x.reason}));
}
