import {ACTION_LIBRARY, findActions} from './vos-intelligence-actions-v1.js';

export const VOS_PLAYBOOK_VERSION='VOS_PLAYBOOK_1.0';

const EXECUTION_DETAILS=Object.freeze({
  ACT_FOLLOWUP_001:{
    how_steps:['Exportar ou abrir a lista de oportunidades em andamento.','Separar novos leads, oportunidades sem resposta e propostas aguardando retorno.','Executar a cadência e registrar data, resposta, próxima ação e motivo de perda.'],
    schedule:['08h30 — responder novos leads','10h00 — executar follow-up 1','14h00 — revisar propostas com 24–48h','16h00 — recuperar oportunidades paradas'],
    deliverable:'Fila comercial atualizada com próxima ação e data para 100% das oportunidades abertas.',
  },
  ACT_SLA_001:{
    how_steps:['Definir o canal que recebe cada novo lead.','Registrar horário de entrada e de primeira resposta.','Criar janelas de monitoramento compatíveis com o horário de atendimento.'],
    schedule:['Início do expediente — zerar fila anterior','A cada 2 horas — checar novos contatos','Fim do expediente — registrar pendências e responsável'],
    deliverable:'SLA documentado e painel semanal de tempo de primeira resposta.',
  },
  ACT_CONTENT_POSITIONING_001:{
    how_steps:['Escolher a lacuna de posicionamento prioritária.','Produzir a semana com problema, autoridade, prova, objeção e oferta.','Registrar conversas qualificadas e avanço para o próximo passo por peça.'],
    schedule:['Segunda — problema','Terça — educativo/autoridade','Quarta — prova','Quinta — objeção','Sexta — oferta + CTA'],
    deliverable:'Cinco peças publicadas e desempenho registrado em uma única planilha ou sistema.',
  },
  ACT_OFFER_CLARITY_001:{
    how_steps:['Escrever em uma frase para quem é a oferta, qual problema resolve e qual transformação entrega.','Definir escopo, limites, preço, prova e próximo passo.','Replicar a mesma versão nos pontos de decisão e registrar dúvidas recorrentes.'],
    schedule:['Dia 1 — versão única da oferta','Dia 2 — revisão dos ativos','Dia 3 — publicação e uso comercial','A cada 15 dias — revisar objeções'],
    deliverable:'Oferta-mãe aprovada e aplicada nos ativos comerciais prioritários.',
  },
  ACT_TRACKING_001:{
    how_steps:['Definir a fonte única para registrar os leads.','Tornar obrigatórios origem, etapa, valor, próxima ação e motivo de perda.','Auditar registros faltantes semanalmente.'],
    schedule:['Diariamente — registrar cada entrada e mudança de etapa','Sexta-feira — auditar campos faltantes','Último dia do mês — fechar baseline'],
    deliverable:'Funil com origem, etapa, valor e próximo passo preenchidos.',
  },
});

function clean(v){return String(v??'').trim();}

export function buildMicroAction(action,{owner,target=null}={}){
  const detail=EXECUTION_DETAILS[action.id];
  if(!detail) throw new Error(`Detalhamento não encontrado para ${action.id}.`);
  return {
    action_id:action.id,
    title:action.title,
    pillar:action.pillar,
    ps:[...action.ps],
    why:`Atacar os sinais ${action.when.join(', ')} sem depender de uma recomendação genérica.`,
    how_steps:[...detail.how_steps],
    schedule:[...detail.schedule],
    frequency:action.micro_template.frequency,
    owner:clean(owner)||action.micro_template.owner,
    example:action.micro_template.example,
    deliverable:detail.deliverable,
    leading_kpi:action.leading_kpis[0]||null,
    intermediate_kpi:action.intermediate_kpis[0]||null,
    business_kpi:action.business_kpis[0]||null,
    target:target||{status:'NEEDS_VALIDATED_TARGET',range:null},
    first_signal_days:[...action.first_signal_days],
    maturity_days:[...action.maturity_days],
    review_rule:action.micro_template.review_rule,
  };
}

export function validateExecutableMicroAction(action={}){
  const scalar=['action_id','title','why','frequency','owner','example','deliverable','leading_kpi','intermediate_kpi','business_kpi','review_rule'];
  const arrays=['how_steps','schedule','first_signal_days','maturity_days'];
  const missing=[
    ...scalar.filter(key=>!clean(action[key])),
    ...arrays.filter(key=>!Array.isArray(action[key]) || action[key].length===0),
    ...(!action.target || !action.target.status ? ['target'] : []),
  ];
  return {valid:missing.length===0,missing};
}

export function buildRoutine(micro_actions=[]){
  const valid=micro_actions.filter(action=>validateExecutableMicroAction(action).valid);
  return {
    today:valid.slice(0,3).map(action=>({action_id:action.action_id,task:action.how_steps[0],owner:action.owner})),
    this_week:valid.flatMap(action=>action.schedule.map(slot=>({action_id:action.action_id,slot,owner:action.owner}))),
    this_month:valid.map(action=>({action_id:action.action_id,deliverable:action.deliverable,leading_kpi:action.leading_kpi,target:action.target})),
    reviews:{
      day_30:valid.map(action=>({action_id:action.action_id,check:action.leading_kpi,rule:action.review_rule})),
      day_60:valid.map(action=>({action_id:action.action_id,check:action.intermediate_kpi,rule:action.review_rule})),
      day_90:valid.map(action=>({action_id:action.action_id,check:action.business_kpi,rule:action.review_rule})),
    },
  };
}

export function buildPlaybook({pillar,ps=[],signals=[],owners={},targets={}}={}){
  const selected=findActions({pillar,ps,signals}).slice(0,3);
  const micro_actions=selected.map(action=>buildMicroAction(action,{owner:owners[action.id],target:targets[action.business_kpis[0]]}));
  const validations=micro_actions.map(action=>({action_id:action.action_id,...validateExecutableMicroAction(action)}));
  return {
    version:VOS_PLAYBOOK_VERSION,
    status:validations.every(item=>item.valid)?'PLAYBOOK_READY':'PLAYBOOK_INCOMPLETE',
    selected_action_ids:selected.map(action=>action.id),
    micro_actions,
    routine:buildRoutine(micro_actions),
    validations,
  };
}

export function buildContentWeek({offer,audience,problem,proof,objection,cta='Fale com a empresa para entender o próximo passo.'}={}){
  const required={offer,audience,problem,proof,objection};
  const missing=Object.entries(required).filter(([,v])=>!clean(v)).map(([key])=>key);
  if(missing.length) return {status:'NEEDS_CONTENT_CONTEXT',missing,items:[]};
  const common={offer:clean(offer),audience:clean(audience),cta:clean(cta)};
  return {
    status:'CONTENT_WEEK_READY',
    items:[
      {day:'Segunda',type:'problema',format:'Carrossel',title:`Por que ${clean(problem)} continua acontecendo?`,cover:`${clean(problem)}: o que está por trás disso`,structure:['Nomeie a situação','Mostre o custo de não agir','Explique a primeira causa a verificar'],caption:`Se ${clean(problem)} faz parte da rotina de ${common.audience}, o primeiro passo não é fazer mais ações: é localizar onde o processo quebra.`,cta:common.cta,kpi:'qualified_inbound_conversations'},
      {day:'Terça',type:'autoridade',format:'Vídeo curto',title:`Como avaliar ${common.offer} antes de investir`,cover:'O que verificar primeiro',structure:['Apresente o critério','Dê um exemplo simples','Mostre o erro mais comum'],caption:`Antes de escolher ${common.offer}, compare clareza, processo e capacidade de medir o resultado. A decisão melhora quando o critério vem antes da ferramenta.`,cta:common.cta,kpi:'qualified_inbound_conversations'},
      {day:'Quarta',type:'prova',format:'Post estático + legenda',title:'O que mudou na prática',cover:'Resultado com contexto',structure:['Cenário anterior','Mudança executada','Evidência observada','Limite da prova'],caption:`Um resultado só vira prova quando mostramos o contexto. Neste caso: ${clean(proof)}. Isso não é promessa universal; é evidência do que aconteceu sob aquelas condições.`,cta:common.cta,kpi:'proof_asset_conversion'},
      {day:'Quinta',type:'objecao',format:'Carrossel',title:`“${clean(objection)}” — o que considerar`,cover:'Antes de decidir, veja isto',structure:['Valide a preocupação','Explique o critério de decisão','Mostre quando não faz sentido comprar'],caption:`A objeção “${clean(objection)}” é legítima. A resposta depende do estágio do negócio, do problema prioritário e da capacidade de executar o plano.`,cta:common.cta,kpi:'objection_to_conversation_rate'},
      {day:'Sexta',type:'conversao',format:'Post de oferta',title:`${common.offer}: para quem precisa de clareza antes de agir`,cover:`${common.offer}`,structure:['Para quem é','Problema tratado','Entregáveis','Próximo passo'],caption:`${common.offer} foi estruturado para ${common.audience} que precisa enfrentar ${clean(problem)} com uma ordem clara de decisão e execução.`,cta:common.cta,kpi:'offer_cta_conversion'},
    ],
  };
}

export function actionLibraryCoverage(){
  return ACTION_LIBRARY.map(action=>({id:action.id,executable:Boolean(EXECUTION_DETAILS[action.id])}));
}

