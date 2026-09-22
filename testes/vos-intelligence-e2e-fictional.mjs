import assert from 'node:assert/strict';
import {generateVosIntelligenceReport} from '../lib/vos-intelligence-report-v1.js';

const METRIC_KEYS=[
  'revenue','gross_margin_pct','average_ticket','leads','contacted_leads','opportunities','proposals','customers',
  'acquisition_spend','attributable_revenue','response_time_minutes','followup_eligible','followup_done','sales_cycle_days','capacity_monthly',
];
const SCORE_IDS=['acquisition_volume','audience_fit','message_offer','channel_content','conversion_journey','operations_measurement'];
const SCORE_NAMES=['Geração de demanda','Aderência ao público','Mensagem e oferta','Canais e conteúdo','Jornada de conversão','Operação e mensuração'];

function answers(overrides={}){
  return {
    Q01:'Prestamos um serviço especializado para pessoas e pequenas empresas.',Q02:'Serviço principal',Q03:'R$ 500',
    Q04:'Pessoas que precisam resolver um problema específico.',Q05:'Querem segurança, clareza e resultado.',
    Q06:'Instagram | Indicação | Principal origem de clientes: Indicação',Q07:'Olha o perfil e chama no WhatsApp.',
    Q08:'Chega pelo canal, conversa, recebe a oferta e decide.',Q09:'Pergunta preço, prazo e o que será entregue.',
    Q10:'WhatsApp e redes sociais',Q11:'Às vezes faço novo contato.',Q12:'Algumas pessoas deixam de responder após receber a proposta.',
    Q13:'Instagram | WhatsApp Business | Depoimentos',Q14:'Atendimento próximo e conhecimento técnico.',
    Q15:'Faço praticamente tudo sozinho(a).',Q16:'Conseguiria, mas com bastante esforço.',
    Q17:'Já publiquei e fiz algumas indicações, sem rotina documentada.',Q18:'Gerar demanda com mais previsibilidade.',
    ...overrides,
  };
}

function metrics(overrides={}){
  return {
    metric_period:'2026-06-01/2026-08-29',revenue:6000,gross_margin_pct:60,average_ticket:600,leads:12,contacted_leads:10,
    opportunities:7,proposals:5,customers:3,acquisition_spend:200,attributable_revenue:1800,response_time_minutes:120,
    followup_eligible:5,followup_done:2,sales_cycle_days:14,capacity_monthly:8,
    ...overrides,
  };
}

function allowedSources(intake){
  return [
    ...Object.keys(intake.answers).filter(key=>String(intake.answers[key]??'').trim()),
    ...Object.keys(intake.complements||{}).filter(key=>String(intake.complements[key]??'').trim()).map(key=>`${key}C`),
    ...Object.keys(intake.metrics).filter(key=>intake.metrics[key]!==null&&intake.metrics[key]!==undefined&&String(intake.metrics[key]).trim()!=='').map(key=>key==='metric_period'?'METRIC_PERIOD':`METRIC_${key.toUpperCase()}`),
    ...(intake.links||[]).map((_,index)=>`LINK${String(index+1).padStart(2,'0')}`),
    ...(intake.images||[]).map((_,index)=>`IMG${String(index+1).padStart(2,'0')}`),
  ];
}

function diagnosticFor(intake,scenario){
  const sources=allowedSources(intake);
  const scoreSources=['Q04','Q06','Q08','Q11','Q13','METRIC_LEADS','METRIC_CUSTOMERS'].filter(id=>sources.includes(id));
  const scorePanel={
    overall_score:0,overall_label:'Em construção',macro_conclusion:scenario.macro,confidence:'consistente',
    indicators:SCORE_IDS.map((id,index)=>({id,name:SCORE_NAMES[index],score:scenario.scores[index],rationale:scenario.rationales[index],confidence:'consistente',sources:scoreSources})),
  };
  const sourceObservations=(intake.images||[]).map((image,index)=>({
    source_id:`IMG${String(index+1).padStart(2,'0')}`,access_status:'analisado',evidence_basis:'visual_analysis',
    observation:scenario.image_observation||'O material visual mostra o perfil e os conteúdos existentes.',
    implication:scenario.image_implication||'O volume e a consistência observados participam da leitura de presença digital.',
    recommended_change:scenario.image_change||'Organizar uma rotina coerente com a oferta e o público.',confidence:'consistente',
  }));
  const base={status:'atencao',reading:'Existe estrutura parcial e um ponto objetivo a desenvolver.',confidence:'consistente',sources:['Q01','Q17']};
  return {
    contract_version:'VOS_DIAGNOSTIC_1.0',executive_summary:scenario.executive_summary,score_panel:scorePanel,
    main_bottleneck:{pillar:scenario.pillar,title:scenario.bottleneck,why_it_matters:scenario.why,confidence:'forte',sources:scenario.bottleneck_sources},
    pillars:['Aquisição','Posicionamento','Operação'].map(name=>({name,...base})),
    ps:['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance'].map(name=>({name,...base})),
    root_hypotheses:[{title:scenario.hypothesis,reading:scenario.hypothesis_reading,nature:'inferencia',status:'atencao',confidence:'consistente',sources:scenario.bottleneck_sources}],
    source_coverage:sources.map(source_id=>({source_id,use:source_id.startsWith('IMG')?'supports_finding':'context_only',reading:'Fonte considerada na leitura integrada.'})),
    source_observations:sourceObservations,action_signals:[scenario.signal],
    priorities:[{title:scenario.priority,why:scenario.why,pillar:scenario.pillar,ps:scenario.ps,impact:'alto',confidence:'alto',urgency:'alto',effort:'medio',action_signal:scenario.signal,sources:scenario.bottleneck_sources}],
    not_assertable:['O score descreve a maturidade observada e não garante resultado futuro.'],
  };
}

const cases=[
  {
    id:'sem_aquisicao',name:'Ateliê Aurora',
    intake:{
      business_name:'Ateliê Aurora',company:{segment:'Artesanato personalizado',business_model:'B2C',region:'Belo Horizonte/MG',channels:['Instagram'],followup_process:'Não existe',business_goal:'Gerar os primeiros pedidos recorrentes',goal_horizon_days:90},
      answers:answers({Q04:'Ainda não sei quem compra com mais frequência.',Q07:'Poucas pessoas chegam ao perfil.',Q11:'Normalmente não faço novo contato.',Q13:'Instagram',Q17:'Criei o perfil, mas publiquei apenas três conteúdos e parei.'}),complements:{},
      metrics:metrics({revenue:0,average_ticket:180,leads:0,contacted_leads:0,opportunities:0,proposals:0,customers:0,acquisition_spend:0,attributable_revenue:0,response_time_minutes:0,followup_eligible:0,followup_done:0,capacity_monthly:20}),
      links:[],images:[{id:'IMG01',name:'instagram.jpg',channel:'Instagram',visible_content_count:3,context:'Perfil com três publicações.',file_id:'img_fixture_1',image_url:'data:image/jpeg;base64,ZmFrZQ=='}],
    },
    scenario:{scores:[10,25,35,15,25,30],macro:'A jornada digital ainda está em construção: a oferta existe, mas a empresa quase não aparece e não gera demanda suficiente para aprender com o mercado.',rationales:['Nenhum lead foi registrado em 90 dias.','O público ainda não foi definido com clareza.','A oferta é explicada, mas ainda sem validação.','Há somente três conteúdos e não existe rotina de presença.','O caminho de compra foi descrito, mas quase não é percorrido.','Não há rotina comercial ou mensuração ativa.'],executive_summary:'A ausência de leads no período demonstra que a aquisição ainda não funciona com frequência suficiente.',pillar:'Aquisição',bottleneck:'A jornada não gera entrada recorrente de interessados',why:'Sem exposição e conversas reais, a empresa não consegue validar público, mensagem ou oferta.',bottleneck_sources:['Q06','Q17','METRIC_PERIOD','METRIC_LEADS'],hypothesis:'A baixa presença limita a geração de demanda',hypothesis_reading:'Três publicações e nenhum lead no período indicam que a empresa precisa construir frequência e testar mensagem.',signal:'lead_volume_critical',priority:'Criar o primeiro ciclo contínuo de aquisição',ps:['Praça','Promoção','Performance'],image_observation:'O perfil apresenta somente três conteúdos publicados e não demonstra continuidade editorial.',image_implication:'A baixa publicação evidencia pouca exposição e poucas oportunidades de aprendizagem com o mercado.',image_change:'Definir uma sequência inicial de conteúdo, CTA e abordagem ativa para gerar as primeiras conversas.'},
    expected:{score:23,label:'Em construção',critical:true},
  },
  {
    id:'em_estruturacao',name:'Clínica Horizonte',
    intake:{business_name:'Clínica Horizonte',company:{segment:'Psicologia',business_model:'B2C',region:'São Paulo/SP',channels:['Instagram','Indicação'],followup_process:'Manual',business_goal:'Aumentar agendamentos particulares',goal_horizon_days:90},answers:answers({Q04:'Mulheres de 28 a 45 anos que buscam terapia particular.',Q17:'Publicamos duas vezes por semana, mas cada profissional comunica de um jeito.'}),complements:{},metrics:metrics(),links:[],images:[]},
    scenario:{scores:[45,65,55,50,50,45],macro:'A clínica já possui público e canais ativos, mas a jornada ainda é inconsistente entre comunicação, passagem para o agendamento e acompanhamento comercial.',rationales:['Há demanda, porém com volume ainda baixo para a capacidade.','O público está descrito com boa clareza.','A proposta é compreensível, mas varia entre profissionais.','Existe frequência, sem narrativa unificada.','O agendamento funciona, mas há perdas sem registro.','O processo é manual e o follow-up é parcial.'],executive_summary:'A base existe, mas a clínica precisa conectar posicionamento, CTA e acompanhamento para transformar presença em mais agendamentos.',pillar:'Posicionamento',bottleneck:'A mensagem e a jornada variam entre profissionais',why:'A inconsistência reduz compreensão e dificulta repetir o que gera agendamento.',bottleneck_sources:['Q04','Q10','Q17'],hypothesis:'A narrativa inconsistente reduz a passagem ao agendamento',hypothesis_reading:'Há atividade, porém a oferta e o próximo passo não aparecem do mesmo modo em todos os contatos.',signal:'oferta_pouco_clara',priority:'Unificar narrativa e caminho de agendamento',ps:['Produto','Promoção','Posicionamento'],},
    expected:{score:52,label:'Funcional com lacunas',critical:false},
  },
  {
    id:'maduro',name:'Norte Consultoria',
    intake:{business_name:'Norte Consultoria',company:{segment:'Consultoria financeira B2B',business_model:'B2B',region:'Brasil',channels:['LinkedIn','Parceiros'],followup_process:'Cadência registrada no CRM',business_goal:'Escalar contratos recorrentes',goal_horizon_days:90},answers:answers({Q04:'Empresas de serviços com faturamento anual entre R$ 2 e 20 milhões e liderança financeira enxuta.',Q08:'Conteúdo ou parceiro → diagnóstico → reunião → proposta → follow-up no CRM → contrato.',Q11:'Tenho uma rotina definida de acompanhamento',Q13:'LinkedIn | Site | CRM | Cases ou resultados de clientes | Automação',Q15:'Tenho uma pequena equipe',Q16:'Conseguiria atender normalmente',Q17:'Mantemos conteúdo, parceiros e prospecção com revisão mensal.'}),complements:{},metrics:metrics({revenue:180000,average_ticket:12000,leads:90,contacted_leads:86,opportunities:42,proposals:24,customers:15,acquisition_spend:9000,attributable_revenue:150000,response_time_minutes:30,followup_eligible:24,followup_done:23,sales_cycle_days:32,capacity_monthly:20}),links:[],images:[]},
    scenario:{scores:[85,90,88,80,82,86],macro:'A jornada digital é madura e integrada: público, oferta, aquisição e processo comercial funcionam de forma conectada, com espaço para ampliar prova e eficiência sem romper a operação.',rationales:['A demanda é recorrente e compatível com a capacidade.','ICP possui critérios objetivos e aderência comercial.','Oferta, valor e diferenciação estão claros.','Existe cadência multicanal revisada periodicamente.','A passagem até contrato é registrada e acompanhada.','CRM, capacidade e indicadores sustentam decisões.'],executive_summary:'A empresa possui uma jornada estruturada e deve priorizar otimizações de eficiência e prova para sustentar escala.',pillar:'Posicionamento',bottleneck:'A prova pode acompanhar melhor a maturidade da operação',why:'A empresa já converte; ampliar provas específicas pode reduzir esforço comercial em novos segmentos.',bottleneck_sources:['Q13','Q14','METRIC_CUSTOMERS'],hypothesis:'Mais prova específica pode reduzir esforço de venda',hypothesis_reading:'A estrutura está madura, mas provas segmentadas podem acelerar confiança em novas contas.',signal:'baixa_prova',priority:'Ampliar provas por tipo de cliente',ps:['Produto','Posicionamento','Promoção'],},
    expected:{score:85,label:'Maduro e integrado',critical:false},
  },
  {
    id:'operacao_saturada',name:'Loja Movimento',
    intake:{business_name:'Loja Movimento',company:{segment:'Moda feminina online',business_model:'B2C',region:'Brasil',channels:['Instagram','Anúncios'],followup_process:'Atendimento sem fila organizada',business_goal:'Crescer sem perder atendimento',goal_horizon_days:90},answers:answers({Q04:'Mulheres de 25 a 44 anos interessadas em peças exclusivas.',Q11:'Às vezes lembro e chamo',Q12:'Muitas pessoas aguardam resposta ou desistem no WhatsApp.',Q15:'Faço praticamente tudo sozinho(a).',Q16:'Não conseguiria atender',Q17:'Os anúncios geram procura, mas o atendimento e o estoque não acompanham.'}),complements:{},metrics:metrics({revenue:85000,average_ticket:280,leads:120,contacted_leads:75,opportunities:65,proposals:50,customers:30,acquisition_spend:5000,attributable_revenue:70000,response_time_minutes:780,followup_eligible:50,followup_done:12,sales_cycle_days:5,capacity_monthly:30}),links:[],images:[]},
    scenario:{scores:[82,72,70,75,48,30],macro:'A aquisição funciona e gera procura, mas a operação está no limite: demora, baixa cobertura de follow-up e capacidade ocupada quebram a continuidade da jornada.',rationales:['A empresa gera demanda recorrente.','O público apresenta aderência à oferta.','A oferta é compreendida e vende.','Canais e anúncios geram procura.','Há perda relevante entre entrada, atendimento e continuidade.','Tempo de resposta, follow-up e capacidade indicam saturação.'],executive_summary:'O problema principal não é atrair mais pessoas, e sim organizar atendimento, capacidade e registro antes de ampliar investimento.',pillar:'Operação',bottleneck:'A operação não acompanha o volume gerado',why:'A demora de 780 minutos, o contato parcial e a capacidade ocupada indicam perda após a aquisição.',bottleneck_sources:['Q12','Q16','METRIC_RESPONSE_TIME_MINUTES','METRIC_FOLLOWUP_DONE','METRIC_CAPACITY_MONTHLY'],hypothesis:'A saturação operacional provoca perda de demanda já conquistada',hypothesis_reading:'A entrada existe, mas parte dos interessados não recebe continuidade no tempo adequado.',signal:'tempo_resposta_alto',priority:'Organizar fila, capacidade e acompanhamento',ps:['Pessoas','Processos','Performance'],},
    expected:{score:63,label:'Estruturado',critical:false},
  },
];

const results=[];
for(const testCase of cases){
  const diagnostic=diagnosticFor(testCase.intake,testCase.scenario);
  const result=await generateVosIntelligenceReport(testCase.intake,{
    api_key:'test-key',
    fetch_impl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({id:`resp_${testCase.id}`,status:'completed',output_text:JSON.stringify(diagnostic),usage:{input_tokens:1500,output_tokens:900,input_tokens_details:{cached_tokens:0}}})}),
  });
  assert.equal(result.report.journey_score.overall_score,testCase.expected.score,`${testCase.id}: score geral`);
  assert.equal(result.report.journey_score.overall_label,testCase.expected.label,`${testCase.id}: faixa`);
  assert.equal(result.report.journey_score.indicators.length,6,`${testCase.id}: seis dimensões`);
  assert.ok(result.report.journey_score.macro_conclusion.length>80,`${testCase.id}: conclusão macro`);
  assert.equal(result.report.strategic_investigation.critical,testCase.expected.critical,`${testCase.id}: guarda de aquisição`);
  if(testCase.expected.critical){
    assert.equal(result.report.strategic_investigation.investigations.length,6);
    assert.equal(result.report.strategic_investigation.actions.length,7);
    assert.doesNotMatch(result.report.source_analysis.observations[0].implication,/limita[cç][aã]o da an[aá]lise/i);
  }
  results.push({id:testCase.id,business:testCase.name,score:result.report.journey_score.overall_score,label:result.report.journey_score.overall_label,bottleneck:result.report.diagnostic.main_bottleneck.pillar});
}

assert.ok(results.find(item=>item.id==='maduro').score>results.find(item=>item.id==='sem_aquisicao').score);
assert.equal(results.find(item=>item.id==='operacao_saturada').bottleneck,'Operação');
console.log(JSON.stringify({ok:true,suite:'VOS_E2E_FICTITIOUS_CLIENTS',cases:results},null,2));
