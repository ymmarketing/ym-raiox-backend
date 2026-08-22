import { comparacaoSegura, sha256Hex } from '../../lib/security.js';

const SALT='YM-RAIOX-HOMOLOG-2026';
const TOKEN_HASH='9cedaaf99e1f53bd9f509e4c077f677fbbddb9e1e3f954f3940f0c7e4c7cebba';

const A={
  RX01:'Yasmin Menezes',RX02:'YM Marketing & Negócios',
  RX03:'Consultoria estratégica de marketing e negócios para pequenos negócios de serviços, especialmente empresas B2B baseadas em conhecimento, confiança, reputação e autoridade. Estruturo posicionamento, jornada digital e comercial, processos e crescimento usando o Método VOS — VER, ORDENAR e SUSTENTAR.',
  RX04:'Base em Belo Horizonte/MG. Atendimento consultivo online para outras regiões e presencialmente em Belo Horizonte quando fizer sentido.',
  RX05:'Empresa constituída em 10/03/2026 e em operação desde 01/04/2026. Operação principal conduzida por Yasmin, com apoio da Lourdes em vídeos/postagens e suporte de automações e sistemas próprios.',
  RX06:'https://ymnegocios.com.br · @ym_marketingenegocios · LinkedIn de Yasmin Menezes · WhatsApp comercial nos CTAs do site.',
  RX07:'Raio-X Estratégico como entrada; Fundação VOS e formatos de implantação/acompanhamento; soluções vinculadas ao diagnóstico em posicionamento, marca, Instagram, LinkedIn, site, páginas, funil, WhatsApp Business, anúncios, Brand Book, campanhas e Fábrica de Conteúdo.',
  RX08:'Fundadoras, sócias e especialistas de pequenos negócios de serviços B2B, especialmente consultorias empresariais, RH, recrutamento e seleção, treinamento, DHO e negócios baseados em conhecimento e autoridade.',
  RX09:3,RX10:3,RX11:3,RX12:3,RX13:2,RX14:3,RX15:3,RX16:3,RX17:2,RX18:2,RX19:3,RX20:3,RX21:4,RX22:3,RX23:4,RX24:3,
  RX25:'Capacidade planejada de até cerca de 10 clientes simultâneos; carteira atual ocupa apenas parte dessa capacidade. Consultoria e decisões estratégicas ainda dependem bastante da fundadora, com apoio operacional, automações e Central YM.',
  RX26:'Método VOS; diagnóstico antes da execução; identidade e posicionamento; Raio-X; integração de marketing, vendas, processos, tecnologia e CX; site e jornada digital; Central YM/CRM; sistemas, materiais oficiais, casos, depoimentos e entregas reais.',
  RX27:'Transformar a estrutura já construída em aquisição previsível e vendas recorrentes. Há muitos ativos, mas a operação comercial e a prospecção ainda estão em consolidação e a YM precisa gerar conversas qualificadas com constância.',
  RX28:'Já foram estruturados site, posicionamento, produto de entrada, CRM/Central YM, funil, automações, conteúdo e materiais comerciais. Também houve prospecção ativa com dezenas de leads, Leituras Iniciais, LinkedIn/WhatsApp e networking. Isso criou base e oportunidades, mas ainda não uma cadência de vendas previsível suficiente.',
  RX29:'Nos próximos 90 dias, transformar a prospecção em uma operação comercial previsível, aumentar leads qualificados e fechar clientes suficientes para sustentar receita mensal próxima de R$ 10 mil, preservando o posicionamento consultivo.',
  RX30:'Medir no CRM origem e volume de leads qualificados, conversas/reuniões, propostas, motivos de perda, novos clientes e receita; observar contratos vindos de prospecção e digital; aproximar a receita mensal de R$ 10 mil com pipeline abastecido.'
};

const PACKET={
  packet_version:'VOS_INTAKE_1.0',questionnaire_version:'RX_CANONICO_1.0',scoring_version:'RX_SCORE_1.0',report_version:'RX_REPORT_1.1',source_product:'RAIO_X_ESTRATEGICO',source_system:'ym_raiox_homologacao',client_ref:'YM Marketing & Negócios',human_validation_required:true,route_signal:null,route_label:'A VALIDAR',
  score:{overall:73,coverage_pct:100,status:'FINAL',p8_scores:{'Produto':75,'Preço':75,'Praça':62.5,'Promoção':75,'Pessoas':50,'Processos':75,'Evidências físicas':87.5,'Produtividade e Qualidade':87.5},journey_views:{Encontrar:{score:62.5,valid:2,total:2},Entender:{score:81.3,valid:4,total:4},Avançar:{score:70,valid:5,total:5},Sustentar:{score:75,valid:3,total:3}}},
  p8_coverage:[
    {p8:'Produto',score:75,coverage:{valid:2,total:2,pct:100},classification:'ATIVO'},
    {p8:'Preço',score:75,coverage:{valid:2,total:2,pct:100},classification:'ATIVO'},
    {p8:'Praça',score:62.5,coverage:{valid:2,total:2,pct:100},classification:'PARCIAL'},
    {p8:'Promoção',score:75,coverage:{valid:2,total:2,pct:100},classification:'ATIVO'},
    {p8:'Pessoas',score:50,coverage:{valid:2,total:2,pct:100},classification:'PARCIAL'},
    {p8:'Processos',score:75,coverage:{valid:2,total:2,pct:100},classification:'ATIVO'},
    {p8:'Evidências físicas',score:87.5,coverage:{valid:2,total:2,pct:100},classification:'ATIVO'},
    {p8:'Produtividade e Qualidade',score:87.5,coverage:{valid:2,total:2,pct:100},classification:'ATIVO'}
  ],
  gaps:[],
  destination:{short_term:A.RX29,success_signal:A.RX30},
  limitations:['O Raio-X mostra onde aprofundar; não transforma um sinal isolado em conclusão definitiva.','As visões da jornada ajudam a interpretar o cenário e não representam uma ordem automática de implantação.']
};

PACKET.interpretation={
  report_version:'RX_REPORT_1.1',
  business_reading:{
    headline:'Consultoria estratégica que conecta diagnóstico, posicionamento, jornada comercial e processos para pequenos negócios de serviços.',
    summary:'A YM já opera com método próprio, produto de entrada, portfólio estruturado e definição clara do público que deseja atrair. A estrutura combina marketing, vendas, processos e tecnologia em uma proposta consultiva, com ativos digitais, comerciais e operacionais já construídos.',
    operating_context:'A operação parte de Belo Horizonte, atende também online e mantém capacidade disponível para crescer. A camada estratégica e boa parte da condução comercial ainda ficam concentradas na fundadora, embora existam apoio operacional, automações e sistemas próprios.'
  },
  destination:{
    strategic_destination:'Sair de uma operação comercial ainda em consolidação para um fluxo mais regular de aquisição e vendas, ocupando melhor a capacidade disponível e aproximando a YM de uma receita mensal de R$ 10 mil sem mudar sua natureza consultiva.',
    success_signal:'A evolução poderá ser percebida qualitativamente por um pipeline que se mantém abastecido e quantitativamente por origem dos leads, reuniões, propostas, perdas, novos contratos e receita acompanhados de forma contínua no CRM.'
  },
  executive_synthesis:'A YM apresenta uma base estrutural mais madura do que seu tempo de operação sugere: oferta, comunicação, processo, prova e controle de números já aparecem como ativos. O contraste mais relevante está entre essa estrutura interna e a capacidade de identificar, comparar e repetir os caminhos que geram novas oportunidades. Ao mesmo tempo, existe capacidade disponível para crescer, mas a condução comercial e estratégica ainda se concentra bastante na fundadora. A leitura indica que vale aprofundar como origem dos leads, cadência comercial, avanço no funil e capacidade operacional se conectam antes de ampliar novos esforços de aquisição.',
  journey_reading:{
    Encontrar:'A YM mantém rotina de comunicação e presença, mas ainda não compara de forma consistente quais origens geram as melhores oportunidades. O desafio desta visão está menos em simplesmente aparecer e mais em transformar os diferentes caminhos de entrada em informação comparável.',
    Entender:'Esta é a visão mais forte. Oferta, mensagem e provas já ajudam o público a compreender o que a YM faz e a confiar antes da conversa comercial. O ganho aqui tende a vir de testar quais elementos de mensagem e prova mais ajudam cada perfil de lead a avançar.',
    Avançar:'O caminho para contato e o processo comercial já existem, assim como follow-up e registros. A leitura fica parcialmente limitada pela concentração da condução comercial em uma pessoa, o que merece ser observado conforme o volume de oportunidades aumentar.',
    Sustentar:'A YM possui boa base de indicadores e registros para acompanhar a operação. A principal tensão desta visão é que o controle dos números está mais desenvolvido do que a distribuição da capacidade entre pessoas, deixando espaço para testar como crescer sem concentrar ainda mais a operação.'
  },
  cross_readings:[
    {title:'Estrutura comercial mais madura que o controle de aquisição',reading:'A YM já possui processo de venda, follow-up e acompanhamento de números, mas ainda está no estágio de conhecer alguns caminhos de entrada sem compará-los de forma consistente. Isso mostra que a visibilidade sobre o que acontece depois que o lead entra está mais desenvolvida do que a inteligência sobre quais origens trazem as oportunidades mais valiosas.',sources:['RX13','RX19','RX20','RX23','RX24'],confidence:'alta',type:'leitura'},
    {title:'Confiança construída antes da conversa',reading:'Clareza de oferta, mensagem nos canais e provas organizadas aparecem juntas. Essa combinação reduz a dependência de explicar credibilidade somente durante uma reunião e cria uma base favorável para testar quais argumentos e evidências realmente influenciam o avanço comercial.',sources:['RX10','RX16','RX21','RX22'],confidence:'alta',type:'leitura'},
    {title:'Capacidade disponível com concentração na fundadora',reading:'Existe espaço operacional para novos clientes, porém atendimento comercial, decisões e parte importante da entrega continuam concentrados em uma pessoa. A combinação não impede crescimento por si só, mas torna importante observar quanto volume adicional pode ser absorvido sem aumentar dependência e tempo de resposta.',sources:['RX17','RX18','RX25'],confidence:'alta',type:'leitura'},
    {title:'A meta pede repetição do que funciona',reading:'A YM já construiu método, produto, CRM, conteúdo, ativos comerciais e ações de prospecção. Como o objetivo de 90 dias está ligado a previsibilidade e receita, a pergunta mais útil deixa de ser apenas “o que ainda falta criar?” e passa a ser “quais mecanismos existentes realmente geram e fazem oportunidades avançarem de forma repetível?”.',sources:['RX26','RX27','RX28','RX29','RX30'],confidence:'alta',type:'leitura'}
  ],
  patrimony_readings:[
    {title:'Método e arquitetura de oferta',reading:'A YM não parte de serviços soltos: existe método próprio, produto de entrada e ofertas com entregas definidas. Isso cria uma base para vender diagnóstico e implantação como partes coerentes de uma mesma proposta de valor.',sources:['RX07','RX09','RX26']},
    {title:'Jornada comercial já desenhada',reading:'O caminho para contato, o processo de venda e o follow-up já possuem estrutura. Esse patrimônio permite concentrar a investigação na qualidade e no desempenho das etapas, sem tratar a jornada como algo inexistente.',sources:['RX14','RX19','RX20','RX26']},
    {title:'Prova e confiança disponíveis',reading:'A YM já reúne diferentes formas de prova e torna parte delas acessível antes da decisão. Isso é especialmente relevante para uma consultoria cuja venda depende de autoridade, reputação e percepção de competência.',sources:['RX21','RX22','RX26']},
    {title:'Base de dados para aprender rápido',reading:'Indicadores e registros confiáveis já fazem parte da operação. Isso permite que testes comerciais sejam acompanhados por evidência, reduzindo a dependência de percepção subjetiva sobre o que está funcionando.',sources:['RX23','RX24','RX30']},
    {title:'Público e mensagem bem delimitados',reading:'A YM sabe qual tipo de negócio deseja atrair e sua proposta já é compreensível na maior parte dos canais. Esse alinhamento dá um ponto de partida claro para comparar a resposta de diferentes perfis dentro do ICP.',sources:['RX08','RX10','RX16']}
  ],
  attention_readings:[
    {title:'Origem das oportunidades ainda pouco comparada',reading:'A YM já conhece alguns caminhos de entrada, mas ainda não os compara de forma suficiente para saber quais geram mais avanço comercial.',possible_impact:'Sem essa comparação, ações de prospecção, conteúdo, networking ou mídia podem consumir energia sem mostrar com clareza qual delas merece mais repetição.',sources:['RX13','RX27','RX28'],confidence:'alta'},
    {title:'Condução comercial concentrada',reading:'Uma pessoa ainda concentra boa parte do atendimento inicial, da condução até a venda e das decisões estratégicas.',possible_impact:'Se o volume de oportunidades crescer, essa concentração pode aumentar tempo de resposta ou disputar agenda com a entrega consultiva; o efeito real precisa ser medido.',sources:['RX17','RX18','RX25'],confidence:'alta'},
    {title:'Distância entre estrutura e resultado desejado',reading:'A empresa declara muitos ativos já implementados, mas ainda busca constância na geração de conversas e contratos. Essa diferença merece ser tratada como pergunta de desempenho da jornada, não como prova de que os ativos atuais estão errados.',possible_impact:'Aprofundar essa diferença pode evitar criar mais canais, peças ou sistemas antes de saber quais partes do ecossistema atual já produzem avanço comercial.',sources:['RX26','RX27','RX28','RX29'],confidence:'alta'}
  ],
  hypotheses:[
    {title:'Consistência de execução pode pesar mais do que falta de ativos',hypothesis:'É possível que a limitação percebida hoje esteja mais relacionada à repetição e mensuração da cadência comercial do que à ausência de estrutura de marketing ou vendas.',evidence:'A YM já possui método, site, CRM, materiais, processo, provas e ações de prospecção, enquanto a dificuldade declarada continua ligada à previsibilidade.',what_to_validate:'Comparar por algumas semanas volume de abordagens, respostas, reuniões, propostas e contratos por origem para verificar se o fluxo melhora quando a cadência se mantém.',sources:['RX26','RX27','RX28','RX30'],confidence:'media'},
    {title:'A concentração na fundadora pode aparecer antes da capacidade total',hypothesis:'Mesmo com espaço para mais clientes, a etapa comercial ou decisória pode se tornar um ponto de saturação antes da capacidade nominal de atendimento.',evidence:'A empresa estima capacidade de até cerca de 10 clientes, mas atendimento comercial e decisões ainda dependem bastante de uma pessoa.',what_to_validate:'Medir tempo semanal gasto em prospecção, follow-up, reuniões, propostas e entrega à medida que novas oportunidades entram.',sources:['RX17','RX18','RX25','RX29'],confidence:'media'}
  ],
  quick_wins:[
    {title:'Comparar origem e avanço',test:'Marcar a origem de toda nova oportunidade e comparar semanalmente quantas chegam a reunião, proposta e contrato por canal.',why:'Ajuda a descobrir quais caminhos de entrada geram avanço real, e não apenas volume.',sources:['RX13','RX23','RX24']},
    {title:'Revisão semanal do pipeline',test:'Criar uma revisão curta e fixa do CRM para olhar contatos sem retorno, propostas abertas e motivos de perda.',why:'Ajuda a transformar registros já existentes em decisões comerciais recorrentes.',sources:['RX19','RX20','RX30']},
    {title:'Medir capacidade por etapa',test:'Registrar por quatro semanas quanto tempo a fundadora gasta em prospecção, venda, diagnóstico e entrega.',why:'Mostra onde a concentração operacional começa a consumir a capacidade planejada.',sources:['RX17','RX18','RX25']},
    {title:'Comparar abordagens de prospecção',test:'Separar resultados das Leituras Iniciais, LinkedIn/WhatsApp, conteúdo e networking usando os mesmos indicadores de avanço.',why:'Permite comparar iniciativas que hoje coexistem sem assumir previamente qual delas é melhor.',sources:['RX28','RX30']},
    {title:'Testar provas nos momentos de decisão',test:'Variar de forma controlada quais depoimentos, casos ou evidências aparecem antes da conversa e junto da proposta.',why:'Ajuda a observar quais tipos de prova apoiam melhor a decisão em cada etapa.',sources:['RX21','RX22']}
  ],
  not_to_decide:[
    'Aumentar investimento em aquisição apenas porque a meta pede mais leads, sem comparar antes a qualidade das origens atuais.',
    'Expandir o portfólio apenas para tentar aumentar vendas, sem observar o desempenho das ofertas que já estão estruturadas.',
    'Concluir que a área de Pessoas precisa ser redesenhada somente pelo Score, sem medir capacidade e carga real da fundadora.',
    'Mudar o posicionamento da YM apenas porque a prospecção ainda não atingiu a constância desejada.'
  ],
  route_to_validate:{
    reading:'Os dados pedem aprofundamento na relação entre origem das oportunidades, cadência de prospecção, avanço no funil e capacidade da fundadora. A YM já possui estrutura suficiente para transformar essas quatro dimensões em testes mensuráveis antes de adicionar novas frentes.',
    validation_questions:[
      'Quais origens geram mais conversas qualificadas, reuniões e propostas — e não apenas contatos?',
      'Em qual etapa do funil as oportunidades deixam de avançar com maior frequência e quais motivos aparecem nos registros?',
      'Quantas novas oportunidades por semana a fundadora consegue conduzir sem comprometer entrega e tempo de resposta?',
      'Qual cadência mínima de prospecção e follow-up precisa se repetir para aproximar a operação do objetivo mensal declarado?'
    ]
  }
};

function escJson(v){return JSON.stringify(v).replace(/</g,'\\u003c');}

export default async function handler(req,res){
  if(String(req.method||'').toUpperCase()!=='GET') return res.status(405).send('Método não permitido');
  const token=String(req.query?.token||'');
  const hash=await sha256Hex(SALT+token);
  if(!token||!comparacaoSegura(hash,TOKEN_HASH)) return res.status(403).send('Acesso não autorizado');
  if(String(req.query?.json||'')==='1') return res.status(200).json({ok:true,answers:A,packet:PACKET,interpretation:PACKET.interpretation});
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raio-X Estratégico — YM Marketing & Negócios</title><meta name="robots" content="noindex,nofollow"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box}body{margin:0;background:#f7f8fc;color:#1c2b40;font-family:Inter,sans-serif}.view{display:none}.view.active{display:block}nav{height:64px;background:#fff;border-bottom:1px solid #e4e8f1;display:flex;align-items:center;padding:0 clamp(18px,5vw,48px);position:sticky;top:0;z-index:20}.brand{font-family:Montserrat,sans-serif;font-weight:900;color:#0b1533}.chip{margin-left:auto;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6356e5;background:#f0efff;padding:7px 12px;border-radius:999px}#repbody{max-width:1140px;margin:0 auto;padding:28px clamp(12px,5vw,36px) 80px}</style></head><body><nav><div class="brand">YM Marketing & Negócios</div><div class="chip">Raio-X Estratégico · Homologação</div></nav><div class="view active" id="view-report"><div id="repbody"></div></div><script>window.A=${escJson(A)};window.PACKET=${escJson(PACKET)};window.RX_QUESTIONS=[];window.RX_NA_LABEL='Não sei / não tenho essa informação';window.go=function(v){document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active')});var e=document.getElementById('view-'+v);if(e)e.classList.add('active')};window.renderReport=function(){};</script><script src="https://ymnegocios.com.br/assets/js/raiox-report-v1-1.js?v=20260822-homolog"></script><script>window.renderReport(window.PACKET);</script></body></html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');return res.status(200).send(html);
}
