import { gerarInterpretacaoRaiox } from '../../lib/raiox-report-v1-1.js';

// Rota TEMPORÁRIA de homologação. Só existe em Vercel Preview e será removida
// antes do merge. Não usa dados reais nem referência de pagamento.
export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ ok: false });
  if (req.method !== 'GET') return res.status(405).json({ ok: false });

  const p8 = [
    ['Produto', 87.5, 'ATIVO'], ['Preço', 62.5, 'MISTA'], ['Praça', 50, 'PARCIAL'],
    ['Promoção', 50, 'PARCIAL'], ['Pessoas', 75, 'ATIVO'], ['Processos', 37.5, 'PONTO_ATENCAO'],
    ['Evidências físicas', 75, 'ATIVO'], ['Produtividade e Qualidade', 87.5, 'ATIVO'],
  ];
  const packet = {
    packet_version: 'VOS_INTAKE_1.0', questionnaire_version: 'RX_CANONICO_1.0', scoring_version: 'RX_SCORE_1.0', report_version: 'RX_REPORT_1.1',
    source_product: 'RAIO_X_ESTRATEGICO',
    score: { overall: 66, coverage_pct: 100, status: 'FINAL', p8_scores: Object.fromEntries(p8.map(x => [x[0], x[1]])), journey_views: { Encontrar:{score:50}, Entender:{score:68.8}, Avançar:{score:45}, Sustentar:{score:83.3} } },
    p8_coverage: p8.map(x => ({ p8:x[0], score:x[1], coverage:{valid:2,total:2,pct:100}, classification:x[2] })),
    patrimony: [
      { p8:'Produto', what:'Oferta compreendida quando existe contexto', origin:'RX10', why:'Há base de clareza para ser preservada.' },
      { p8:'Evidências físicas', what:'Provas de trabalho já existem', origin:'RX21', why:'O negócio não parte do zero em confiança.' },
      { p8:'Produtividade e Qualidade', what:'Há acompanhamento de indicadores', origin:'RX23/RX24', why:'Existe capacidade de observar evolução.' },
    ],
    attention_points: [
      { p8:'Processos', observation:'A continuidade comercial é menos estruturada.', origin:'RX20', possible_reading:'O registro do que acontece após o contato ainda pode ser parcial.', probable_impact:'Pode reduzir visibilidade sobre perdas e retomadas.' },
      { p8:'Praça', observation:'A origem da demanda é acompanhada parcialmente.', origin:'RX13', possible_reading:'Existe conhecimento de alguns caminhos, mas ainda sem comparação consistente.', probable_impact:'Pode limitar a leitura de quais entradas realmente avançam.' },
    ],
    gaps: [],
    destination: {
      short_term:'Quero que o diagnóstico funcione sem eu precisar prospectar e mandar o link manualmente, que a pessoa faça, perceba valor e eu consiga fechar minhas primeiras cinco vendas da solução seguinte pelo funil que desenhei.',
      success_signal:'Vou considerar que melhorou quando começarem a chegar diagnósticos sem prospecção manual, eu enxergar os dados da jornada e conseguir converter cinco clientes pelo fluxo planejado.'
    },
    limitations:['O Raio-X mostra onde aprofundar; não fecha causa-raiz, prioridade final nem sequência de implantação.']
  };

  const answers = {
    RX01:'Pessoa Teste', RX02:'Negócio Teste', RX03:'Consultoria de marketing e negócios que analisa jornadas digitais e ajuda a conectar processos, canais e estratégia para empresas de serviços.',
    RX04:'Atendimento online e presencial em Belo Horizonte.', RX05:'Operação recente, equipe enxuta.', RX06:'Instagram, site e LinkedIn.',
    RX07:'Diagnóstico estratégico e projetos de estruturação da jornada digital; o objetivo é organizar a experiência do cliente e os processos de aquisição e conversão.', RX08:'Pequenos negócios de serviços com operação real e jornada digital ainda pouco estruturada.',
    RX09:'Minhas principais opções têm entrega e limites claros', RX10:'Entende bem na maior parte dos canais', RX11:'Tenho algumas referências, mas sem um padrão claro', RX12:'Fica claro o que está incluído e o que a pessoa recebe',
    RX13:'Sei alguns caminhos, mas não comparo', RX14:'Existe um caminho, mas ainda tem dificuldades', RX15:'Aparece, mas sem uma frequência definida', RX16:'Parte está clara, mas ainda há dúvidas',
    RX17:'Existe uma pessoa claramente responsável', RX18:'Algumas atividades dependem de uma única pessoa', RX19:'Tenho algumas etapas, mas ainda não estão registradas', RX20:'Não registro de forma consistente o retorno e o motivo de não avançar',
    RX21:'Tenho várias provas do trabalho organizadas', RX22:'As provas aparecem em alguns pontos antes da decisão', RX23:'Acompanho vários números importantes da rotina', RX24:'Tenho registros dos últimos meses',
    RX25:'Consigo atender a demanda atual, mas crescimento exigirá organização.', RX26:'Tenho método próprio, formação e depoimentos.', RX27:'O desafio é transformar interesse em entrada recorrente sem depender de prospecção manual.', RX28:'Já testei conteúdo, prospecção e um funil inicial, mas ainda depende muito de ação direta.',
    RX29:packet.destination.short_term, RX30:packet.destination.success_signal,
  };
  const responses = Array.from({length:30}, (_,i) => {
    const id = 'RX' + String(i+1).padStart(2,'0');
    return { question_id:id, field_id:id, question:'Pergunta de homologação '+id, answer:answers[id] || null, response_type:(i < 8 || i >=24) ? 'open' : 'scale' };
  });

  try {
    const interpretation = await gerarInterpretacaoRaiox(packet, responses);
    return res.status(200).json({ ok:true, interpretation });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
}
