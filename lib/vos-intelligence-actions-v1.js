/**
 * Biblioteca inicial de ações do VOS Intelligence.
 * Cada ação é hipótese de intervenção, nunca garantia de causalidade.
 */
export const ACTION_LIBRARY_VERSION = 'VOS_ACTION_LIBRARY_1.0';

export const ACTION_LIBRARY = Object.freeze([
  {
    id:'ACT_ICP_001',
    title:'Definir e validar uma hipótese de ICP e persona',
    pillar:'Aquisição',
    ps:['Produto','Praça','Posicionamento','Performance'],
    when:['lead_volume_critical','icp_fit_unknown'],
    leading_kpis:['leads_with_icp_classification_pct'],
    intermediate_kpis:['qualified_leads'],
    business_kpis:['lead_to_customer_pct','revenue'],
    first_signal_days:[7,14],
    maturity_days:[30,60],
    micro_template:{
      frequency:'Projeto inicial + revisão semanal durante o teste',
      owner:'Estratégia/comercial',
      how:'Definir perfil, problema, momento de compra, capacidade e sinais de aderência; aplicar os critérios aos contatos existentes e novos.',
      example:'Escolher um segmento prioritário, três dores observáveis e cinco critérios objetivos para classificar cada lead como aderente, parcial ou fora do ICP.',
      review_rule:'Se a maioria dos contatos ficar fora do ICP, revisar canal e abordagem antes de alterar preço ou ampliar investimento.'
    }
  },
  {
    id:'ACT_ACQUISITION_CYCLE_001',
    title:'Executar ciclo de aquisição comparável por quatro semanas',
    pillar:'Aquisição',
    ps:['Praça','Promoção','Processos','Performance'],
    when:['lead_volume_critical','acquisition_routine_absent','origem_desconhecida'],
    leading_kpis:['acquisition_actions_completed'],
    intermediate_kpis:['qualified_leads'],
    business_kpis:['lead_to_customer_pct','revenue'],
    first_signal_days:[7,14],
    maturity_days:[30,60],
    micro_template:{
      frequency:'Diária e semanal por quatro semanas',
      owner:'Marketing/comercial',
      how:'Combinar conteúdo, prospecção ativa e parcerias com cadência definida; registrar canal, mensagem, resposta e aderência ao ICP.',
      example:'Por quatro semanas: conteúdo com CTA, prospecção de contas aderentes e ativação de parceiros; comparar conversas qualificadas por origem e mensagem.',
      review_rule:'Ao final de quatro semanas, manter canais e mensagens que geraram conversas aderentes; revisar ou interromper o restante.'
    }
  },
  {
    id:'ACT_NARRATIVE_TEST_001',
    title:'Reescrever e testar a narrativa da oferta',
    pillar:'Aquisição',
    ps:['Produto','Promoção','Posicionamento','Performance'],
    when:['lead_volume_critical','message_resonance_unknown','oferta_pouco_clara','oferta_generica'],
    leading_kpis:['message_variants_tested'],
    intermediate_kpis:['qualified_inbound_conversations'],
    business_kpis:['lead_to_customer_pct','revenue'],
    first_signal_days:[7,14],
    maturity_days:[30,60],
    micro_template:{
      frequency:'Semanal durante o ciclo de validação',
      owner:'Estratégia/conteúdo',
      how:'Criar versões da mensagem centradas em problema, resultado, mecanismo, prova e próximo passo; testar uma variável por vez.',
      example:'Comparar duas aberturas para o mesmo ICP: uma centrada na dor reconhecida e outra no resultado esperado, mantendo a mesma oferta e CTA.',
      review_rule:'Após volume comparável, manter a narrativa que gerar mais conversas aderentes; se nenhuma reagir, revisar problema, público ou oferta.'
    }
  },
  {
    id:'ACT_FOLLOWUP_001',
    title:'Implantar rotina de follow-up comercial',
    pillar:'Operação',
    ps:['Pessoas','Processos','Performance'],
    when:['leads_sem_retorno','propostas_paradas','followup_baixo'],
    leading_kpis:['followup_coverage_pct'],
    intermediate_kpis:['lead_to_contact_pct','proposal_to_customer_pct'],
    business_kpis:['lead_to_customer_pct','revenue'],
    first_signal_days:[7,14],
    maturity_days:[30,60],
    micro_template:{
      frequency:'Diária',
      owner:'Responsável comercial',
      how:'Listar oportunidades abertas por idade e executar a sequência de contato definida; registrar resultado e motivo.',
      example:'08h30: novos leads; 10h: follow-up 1; 14h: propostas 24–48h; 16h: recuperação de oportunidades.',
      review_rule:'Se a cobertura de follow-up ficar abaixo de 90% por 7 dias, revisar capacidade, SLA e automação.'
    }
  },
  {
    id:'ACT_SLA_001',
    title:'Definir SLA de primeira resposta',
    pillar:'Operação',
    ps:['Pessoas','Processos','Performance'],
    when:['tempo_resposta_alto','perda_no_primeiro_contato'],
    leading_kpis:['response_time_minutes'],
    intermediate_kpis:['lead_to_contact_pct'],
    business_kpis:['lead_to_customer_pct','revenue'],
    first_signal_days:[3,7],
    maturity_days:[14,30],
    micro_template:{
      frequency:'Diária',
      owner:'Responsável pelo primeiro atendimento',
      how:'Monitorar fila de novos contatos em blocos ao longo do expediente e registrar horário de entrada e primeira resposta.',
      example:'Checar novos contatos no início do expediente e em janelas recorrentes definidas pelo volume real da empresa.',
      review_rule:'Se o SLA for cumprido e a taxa de contato não reagir em 14 dias, revisar qualidade/origem do lead e abordagem.'
    }
  },
  {
    id:'ACT_CONTENT_POSITIONING_001',
    title:'Executar grade de conteúdo orientada ao gargalo de posicionamento',
    pillar:'Posicionamento',
    ps:['Produto','Promoção','Posicionamento','Performance'],
    when:['oferta_pouco_clara','baixa_diferenciacao','baixa_prova','objecoes_recorrentes'],
    leading_kpis:['content_execution_rate'],
    intermediate_kpis:['qualified_inbound_conversations','offer_page_conversion'],
    business_kpis:['lead_to_customer_pct','revenue'],
    first_signal_days:[14,30],
    maturity_days:[45,90],
    micro_template:{
      frequency:'Semanal',
      owner:'Marketing/conteúdo',
      how:'Distribuir conteúdos entre problema, autoridade, prova, objeção, diferenciação e conversão conforme a lacuna dominante.',
      example:'Seg: problema; Ter: educativo; Qua: prova; Qui: objeção; Sex: oferta/CTA. A proporção deve ser recalibrada pelo diagnóstico.',
      review_rule:'Após 4–8 peças comparáveis, manter formatos/temas que gerem conversas qualificadas e revisar os que não avançam o KPI intermediário.'
    }
  },
  {
    id:'ACT_OFFER_CLARITY_001',
    title:'Revisar clareza e estrutura da oferta',
    pillar:'Posicionamento',
    ps:['Produto','Preço','Posicionamento'],
    when:['oferta_generica','duvida_sobre_entrega','baixa_taxa_proposta_venda'],
    leading_kpis:['offer_assets_updated'],
    intermediate_kpis:['proposal_to_customer_pct'],
    business_kpis:['average_ticket','revenue'],
    first_signal_days:[14,30],
    maturity_days:[30,60],
    micro_template:{
      frequency:'Projeto + revisão quinzenal na fase de teste',
      owner:'Estratégia/comercial',
      how:'Definir público, problema, transformação, escopo, limites, prova, preço e próximo passo em uma versão única da oferta.',
      example:'Uma frase de oferta + entregáveis + para quem é/não é + prova + CTA, replicados nos principais pontos de decisão.',
      review_rule:'Se dúvidas e objeções permanecerem iguais após ciclo suficiente de propostas, revisar mensagem, escopo ou preço.'
    }
  },
  {
    id:'ACT_TRACKING_001',
    title:'Implantar mensuração mínima de aquisição e funil',
    pillar:'Operação',
    ps:['Processos','Performance'],
    when:['dados_insuficientes','origem_desconhecida','cac_desconhecido'],
    leading_kpis:['data_completion_rate'],
    intermediate_kpis:['channel_attribution_rate'],
    business_kpis:['cac','lead_to_customer_pct','revenue'],
    first_signal_days:[7,14],
    maturity_days:[30,30],
    micro_template:{
      frequency:'Diária para registro; semanal para auditoria',
      owner:'Operação/comercial',
      how:'Registrar origem, etapa, valor, status e motivo de perda de cada oportunidade em uma fonte única.',
      example:'Todo lead novo recebe origem e etapa; toda venda recebe valor; toda perda recebe motivo; sexta-feira auditar registros faltantes.',
      review_rule:'Não liberar projeção financeira enquanto a cobertura mínima de dados não atingir o patamar definido pelo Data Quality Gate.'
    }
  }
]);

export function findActions({pillar, ps=[], signals=[]}={}) {
  const pset=new Set(ps);
  const sset=new Set(signals);
  return ACTION_LIBRARY
    .map(action=>{
      let score=0;
      if(pillar && action.pillar===pillar) score+=4;
      score+=action.ps.filter(p=>pset.has(p)).length*2;
      score+=action.when.filter(s=>sset.has(s)).length*3;
      return {...action,match_score:score};
    })
    .filter(x=>x.match_score>0)
    .sort((a,b)=>b.match_score-a.match_score);
}
