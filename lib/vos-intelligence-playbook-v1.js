import {ACTION_LIBRARY, findActions} from './vos-intelligence-actions-v1.js';

export const VOS_PLAYBOOK_VERSION='VOS_PLAYBOOK_1.0';

const EXECUTION_DETAILS=Object.freeze({
  ACT_ICP_001:{
    how_steps:['Escolher um segmento prioritário para o primeiro ciclo.','Definir problema, momento de compra e critérios objetivos de aderência.','Classificar os leads atuais e novos como aderentes, parciais ou fora do ICP.'],
    schedule:['Dia 1 — hipótese de ICP e persona','Dia 2 — classificação dos contatos atuais','Semanalmente — revisar padrões encontrados'],
    deliverable:'Ficha de ICP/persona com critérios aplicados a todos os leads do ciclo.',
  },
  ACT_ACQUISITION_CYCLE_001:{
    how_steps:['Definir cadência semanal de conteúdo, prospecção e parcerias.','Executar as três frentes por quatro semanas sem trocar todas as variáveis ao mesmo tempo.','Registrar origem, mensagem, resposta, aderência e avanço de cada contato.'],
    schedule:['Segunda — planejar lista, conteúdo e parceiros','Terça a quinta — executar e registrar','Sexta — comparar volume e qualidade por origem'],
    deliverable:'Ciclo de quatro semanas com atividades e conversas qualificadas comparáveis por canal.',
  },
  ACT_NARRATIVE_TEST_001:{
    how_steps:['Escolher uma dor reconhecida pelo ICP.','Escrever mensagem com problema, resultado, mecanismo, prova e CTA.','Testar versões em condições comparáveis e registrar as conversas geradas.'],
    schedule:['Semana 1 — narrativa A','Semana 2 — narrativa B','Semanas 3 e 4 — repetir e confirmar o padrão'],
    deliverable:'Narrativa principal validada ou lista clara do que precisa ser revisto.',
  },
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

function conciseLabel(value,{fallback='o tema prioritário',max=88}={}){
  const normalized=clean(value).replace(/\s+/g,' ').replace(/^["“”']+|["“”']+$/g,'');
  if(!normalized) return fallback;
  const firstClause=normalized.split(/\s+(?:que|para|porque|como produto)\s+|[.;:\n]|,\s+(?:como|para|porque)\s+/i)[0].trim();
  const candidate=firstClause.length>=12 ? firstClause : normalized;
  if(candidate.length<=max) return candidate.replace(/[.,;:]+$/,'');
  const clipped=candidate.slice(0,max+1).replace(/\s+\S*$/,'').trim();
  return (clipped||fallback).replace(/[.,;:]+$/,'');
}

function buildCriticalAcquisitionContentWeek({offer,audience,cta}){
  const offerLabel=conciseLabel(offer,{fallback:'diagnóstico estratégico',max:64});
  const audienceLabel=conciseLabel(audience,{fallback:'negócios de serviços',max:72});
  return {
    status:'CONTENT_WEEK_READY',
    strategy:'critical_acquisition_validation',
    items:[
      {day:'Segunda',type:'problema',format:'Carrossel',title:'Poucos leads não são um problema de follow-up',cover:'Se os leads não chegam, olhe antes da venda',structure:['Mostre o volume do período','Explique por que a amostra não permite concluir conversão','Apresente as seis causas a investigar'],caption:'Quando quase ninguém entra no funil, insistir nos mesmos contatos não cria previsibilidade. Primeiro é preciso verificar exposição, rotina, ICP, mensagem, jornada e registro.',cta,kpi:'qualified_inbound_conversations'},
      {day:'Terça',type:'autoridade',format:'Vídeo curto',title:'Como descobrir se o gargalo está no canal, no público ou na mensagem',cover:'Canal, ICP ou narrativa?',structure:['Apresente um sinal de cada hipótese','Mostre como registrar a evidência','Explique por que testar uma variável por vez'],caption:`Para ${audienceLabel}, a pergunta não é qual canal está na moda. É qual combinação de público, problema e mensagem gera conversas aderentes de forma repetível.`,cta,kpi:'qualified_inbound_conversations'},
      {day:'Quarta',type:'prova',format:'Post estático + legenda',title:`O que o ${offerLabel} precisa revelar antes da execução`,cover:'Diagnóstico não é resumo: é ordem de investigação',structure:['Dado observado','Hipóteses concorrentes','Teste recomendado','Decisão que o teste libera'],caption:'Uma boa prova do diagnóstico mostra como um dado muda a ordem das decisões. Use um exemplo anonimizado com situação inicial, leitura, ação e limite da conclusão.',cta,kpi:'proof_asset_conversion'},
      {day:'Quinta',type:'objecao',format:'Carrossel',title:'Preço acessível não substitui clareza de valor',cover:'A dúvida não desaparece só porque custa menos',structure:['Mostre a dúvida real do comprador','Explique a entrega concreta','Dê um exemplo do que ele decide depois'],caption:`Se a pessoa não entende o que recebe, para quem serve e qual decisão poderá tomar, reduzir o preço não resolve a incerteza. Torne a entrega do ${offerLabel} visível antes do CTA.`,cta,kpi:'objection_to_conversation_rate'},
      {day:'Sexta',type:'conversao',format:'Post de oferta',title:`${offerLabel}: descubra onde olhar primeiro`,cover:'Antes de investir mais, identifique o próximo ponto de decisão',structure:['Para quem é','Sinal de que faz sentido','O que será investigado','Próximo passo único'],caption:`O ${offerLabel} ajuda ${audienceLabel} a separar o que os dados já mostram do que ainda precisa ser validado — e transforma essa leitura em uma ordem prática de investigação e ação.`,cta,kpi:'offer_cta_conversion'},
    ],
  };
}

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

export function buildContentWeek({offer,audience,problem,proof,objection,cta='Fale com a empresa para entender o próximo passo.',signals=[]}={}){
  const required={offer,audience,problem,proof,objection};
  const missing=Object.entries(required).filter(([,v])=>!clean(v)).map(([key])=>key);
  if(missing.length) return {status:'NEEDS_CONTENT_CONTEXT',missing,items:[]};
  const common={offer:conciseLabel(offer,{fallback:'a oferta'}),audience:conciseLabel(audience,{fallback:'o público prioritário'}),cta:clean(cta)};
  if(signals.includes('lead_volume_critical')) return buildCriticalAcquisitionContentWeek(common);
  const problemLabel=conciseLabel(problem,{fallback:'o problema prioritário'});
  const proofLabel=conciseLabel(proof,{fallback:'a evidência disponível',max:120});
  const objectionLabel=conciseLabel(objection,{fallback:'a dúvida principal',max:110});
  return {
    status:'CONTENT_WEEK_READY',
    items:[
      {day:'Segunda',type:'problema',format:'Carrossel',title:`Por que ${problemLabel} continua acontecendo?`,cover:`${problemLabel}: o que está por trás disso`,structure:['Nomeie a situação','Mostre o custo de não agir','Explique a primeira causa a verificar'],caption:`Se ${problemLabel} faz parte da rotina de ${common.audience}, o primeiro passo não é fazer mais ações: é localizar onde o processo quebra.`,cta:common.cta,kpi:'qualified_inbound_conversations'},
      {day:'Terça',type:'autoridade',format:'Vídeo curto',title:`Como avaliar ${common.offer} antes de investir`,cover:'O que verificar primeiro',structure:['Apresente o critério','Dê um exemplo simples','Mostre o erro mais comum'],caption:`Antes de escolher ${common.offer}, compare clareza, processo e capacidade de medir o resultado. A decisão melhora quando o critério vem antes da ferramenta.`,cta:common.cta,kpi:'qualified_inbound_conversations'},
      {day:'Quarta',type:'prova',format:'Post estático + legenda',title:'O que mudou na prática',cover:'Resultado com contexto',structure:['Cenário anterior','Mudança executada','Evidência observada','Limite da prova'],caption:`Um resultado só vira prova quando mostramos contexto e limite. Use ${proofLabel} como ponto de partida e deixe claro o que ainda precisa ser validado.`,cta:common.cta,kpi:'proof_asset_conversion'},
      {day:'Quinta',type:'objecao',format:'Carrossel',title:`“${objectionLabel}” — o que considerar`,cover:'Antes de decidir, veja isto',structure:['Valide a preocupação','Explique o critério de decisão','Mostre quando não faz sentido comprar'],caption:`A dúvida sobre ${objectionLabel.toLowerCase()} é legítima. Responda com critérios, exemplos e limites da entrega — não apenas com uma promessa.`,cta:common.cta,kpi:'objection_to_conversation_rate'},
      {day:'Sexta',type:'conversao',format:'Post de oferta',title:`${common.offer}: para quem precisa de clareza antes de agir`,cover:`${common.offer}`,structure:['Para quem é','Problema tratado','Entregáveis','Próximo passo'],caption:`${common.offer} foi estruturado para ${common.audience} que precisa enfrentar ${problemLabel} com uma ordem clara de decisão e execução.`,cta:common.cta,kpi:'offer_cta_conversion'},
    ],
  };
}

export function actionLibraryCoverage(){
  return ACTION_LIBRARY.map(action=>({id:action.id,executable:Boolean(EXECUTION_DETAILS[action.id])}));
}
