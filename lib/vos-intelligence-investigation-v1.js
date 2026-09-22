import {analyzeMetricPeriod} from './vos-intelligence-v1.js';

export const VOS_INVESTIGATION_VERSION='VOS_INVESTIGATION_1.0';

function num(value){
  if(value==='' || value===null || value===undefined) return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

function source(...ids){return [...new Set(ids.filter(Boolean))];}

export function buildAcquisitionInvestigation(intake={}){
  const metrics=intake.metrics||{};
  const answers=intake.answers||{};
  const period=analyzeMetricPeriod(metrics.metric_period);
  const leads=num(metrics.leads);
  const customers=num(metrics.customers);
  const spend=num(metrics.acquisition_spend);
  const capacity=num(metrics.capacity_monthly);
  const leadsPer30=period.days && leads!==null ? Number((leads*30/period.days).toFixed(2)) : null;
  const critical=Boolean(period.days>=30 && leads!==null && leadsPer30<1);
  if(!critical) return {version:VOS_INVESTIGATION_VERSION,status:'NOT_TRIGGERED',critical:false};

  const business=String(intake.business_name||'O negócio').trim();
  const leadText=leads===0?'nenhum lead':`${leads} lead${leads===1?'':'s'}`;
  const monthRate=leadsPer30===null?'não calculada':String(leadsPer30).replace('.',',');
  const evidence=source('METRIC_PERIOD','METRIC_LEADS','METRIC_CUSTOMERS','METRIC_ACQUISITION_SPEND','METRIC_CAPACITY_MONTHLY','Q06','Q17','Q18');

  return {
    version:VOS_INVESTIGATION_VERSION,
    status:'ACQUISITION_CRITICAL',
    critical:true,
    conclusion:{
      title:'A aquisição ainda não gera volume recorrente para criar previsibilidade',
      reading:`${business} informou ${leadText} em ${period.days} dias — média de ${monthRate} lead por 30 dias. Isso já demonstra que a geração de demanda não está funcionando com a frequência necessária para sustentar aprendizado, conversão e crescimento previsível.`,
      confidence:'forte',
      evidence,
      boundary:'O problema de volume está demonstrado. O questionário ainda não prova qual causa explica esse problema; por isso, as hipóteses abaixo precisam ser investigadas em sequência.',
    },
    context:{period_days:period.days,leads,leads_per_30d:leadsPer30,customers,acquisition_spend:spend,capacity_monthly:capacity},
    investigations:[
      {order:1,title:'Exposição e distribuição',question:'A empresa está aparecendo com frequência suficiente nos canais em que o cliente ideal realmente está?',why:'Sem distribuição recorrente, a oferta não gera amostra suficiente para aprender.',linked_actions:[4,6],sources:source('Q06','Q17','METRIC_LEADS','METRIC_PERIOD')},
      {order:2,title:'Rotina de aquisição',question:'Existe uma rotina executada de conteúdo, prospecção ativa e parcerias, com volume registrado por semana?',why:'Ter canais disponíveis não significa que exista um mecanismo ativo de aquisição.',linked_actions:[4,6],sources:source('Q06','Q17','METRIC_ACQUISITION_SPEND')},
      {order:3,title:'Compatibilidade com ICP e persona',question:'As poucas pessoas alcançadas têm perfil, problema, momento de compra e capacidade compatíveis com a oferta?',why:'Sem classificar aderência, não sabemos se existe pouco volume ou pouco volume qualificado.',linked_actions:[1,2,5],sources:source('Q04','Q05','METRIC_LEADS')},
      {order:4,title:'Narrativa e oferta',question:'O público correto reconhece rapidamente o problema, o valor da solução e o resultado que pode obter?',why:'A mensagem pode estar descrevendo o serviço sem criar identificação, urgência ou desejo de avançar.',linked_actions:[2,3,6],sources:source('Q02','Q05','Q09','Q12','Q17')},
      {order:5,title:'Chamada e jornada de entrada',question:'Depois de se interessar, a pessoa entende o próximo passo e consegue avançar sem atrito?',why:'CTA, página, WhatsApp, preço ou explicação podem interromper uma intenção que chegou a existir.',linked_actions:[2,3,6],sources:source('Q08','Q09','Q10','Q12')},
      {order:6,title:'Registro e mensuração',question:'Todos os contatos estão sendo reconhecidos e registrados como leads, com origem, aderência e avanço?',why:'Parte do problema pode ser geração baixa; outra parte pode ser invisibilidade causada por registro incompleto.',linked_actions:[5,6],sources:source('Q07','Q13','METRIC_LEADS')},
    ],
    actions:[
      {order:1,title:'Definir uma hipótese objetiva de ICP e persona',purpose:'Escolher quem será priorizado, qual problema será tratado e quais critérios tornam um contato aderente.',investigations:[3]},
      {order:2,title:'Auditar individualmente os leads existentes',purpose:`Classificar os ${leads} leads por origem, aderência ao ICP, dor, mensagem recebida, avanço e motivo de não compra.`,investigations:[3,4,5]},
      {order:3,title:'Reescrever a narrativa principal da oferta',purpose:'Transformar a explicação do serviço em problema reconhecível, resultado esperado, forma de entrega, prova e próximo passo.',investigations:[4,5]},
      {order:4,title:'Criar uma rotina combinada de aquisição',purpose:'Executar conteúdo, prospecção ativa e parcerias com frequência definida, sem depender apenas de indicação.',investigations:[1,2]},
      {order:5,title:'Registrar origem e aderência de cada novo lead',purpose:'Marcar canal, campanha ou mensagem, ICP, etapa, próxima ação e motivo de perda.',investigations:[3,6]},
      {order:6,title:'Rodar um ciclo comparável de quatro semanas',purpose:'Testar canais, narrativas e chamadas mantendo registro suficiente para decidir o que continuar, mudar ou interromper.',investigations:[1,2,4,5,6]},
      {order:7,title:'Fazer follow-up dos leads atuais como ação de higiene',purpose:'Retomar os contatos existentes e registrar respostas, sem tratar três leads como estratégia principal de crescimento.',investigations:[2,5,6]},
    ],
  };
}

export function applyAcquisitionGuard(diagnostic={},investigation={}){
  if(!investigation?.critical) return diagnostic;
  const primary={
    title:'Restabelecer geração de demanda e validar o caminho de aquisição',
    why:investigation.conclusion.reading,
    pillar:'Aquisição',
    ps:['Praça','Promoção','Posicionamento','Performance'],
    impact:'alto',confidence:'alto',urgency:'alto',effort:'medio',
    action_signal:'lead_volume_critical',
    sources:investigation.conclusion.evidence,
  };
  const remaining=(diagnostic.priorities||[])
    .filter(item=>item.action_signal!=='followup_baixo' && item.action_signal!=='leads_sem_retorno')
    .slice(0,2);
  return {
    ...diagnostic,
    executive_summary:`${investigation.conclusion.reading} Antes de otimizar conversão ou follow-up, é necessário investigar exposição, rotina de aquisição, aderência ao ICP, narrativa, jornada e registro.`,
    main_bottleneck:{pillar:'Aquisição',title:investigation.conclusion.title,why_it_matters:investigation.conclusion.boundary,confidence:'forte',sources:investigation.conclusion.evidence},
    action_signals:[...new Set([
      'lead_volume_critical','icp_fit_unknown','acquisition_routine_absent',
      'message_resonance_unknown','journey_friction_unknown','tracking_gap_possible',
      ...(diagnostic.action_signals||[])
    ])],
    priorities:[primary,...remaining],
  };
}
