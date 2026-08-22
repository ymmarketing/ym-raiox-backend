/**
 * Homologação completa do Raio-X com dados reais da própria YM.
 * GET ?token=...        -> abre o HTML oficial já preenchido e processa o relatório.
 * GET ?token=...&json=1 -> devolve a interpretação RX_REPORT_1.1 para auditoria.
 *
 * Não persiste intake/cliente/oportunidade no CRM. A referência APPROVED existe
 * apenas para permitir que a mesma camada interpretativa protegida do fluxo real
 * seja exercitada ponta a ponta.
 */
import { store, STATUS, temRedis } from '../../lib/store.js';
import { comparacaoSegura, gerarRef, limitarTaxa, log, sha256Hex } from '../../lib/security.js';
import { gerarInterpretacaoRaiox, REPORT_VERSION, temChaveRaioxInterpretativo } from '../../lib/raiox-report-v1-1.js';

const SALT = 'YM-RAIOX-HOMOLOG-2026';
const TOKEN_HASH = '9cedaaf99e1f53bd9f509e4c077f677fbbddb9e1e3f954f3940f0c7e4c7cebba';
const OFFICIAL_HTML = 'https://ymnegocios.com.br/raio-x.html';
const SELF = 'https://ym-raiox-backend.vercel.app/api/homologacao/ym-raiox';

const QUESTIONS = [
  ['RX01','META_CLIENT_NAME','Contexto',null,null,'Como você se chama?'],
  ['RX02','BUSINESS_NAME','Contexto',null,null,'Qual o nome do seu negócio?'],
  ['RX03','BUSINESS_SEGMENT','Contexto','Produto',null,'Qual é o seu segmento e, em poucas palavras, o que seu negócio faz?'],
  ['RX04','SERVICE_MODE_LOCATION','Contexto','Praça',null,'Onde e como você atende seus clientes hoje?'],
  ['RX05','BUSINESS_AGE_TEAM_SIZE','Contexto',null,null,'Há quanto tempo seu negócio existe e quantas pessoas trabalham nele hoje?'],
  ['RX06','DIGITAL_CHANNEL_LINKS','Contexto',null,null,'Quais são os links ou @ dos principais canais do seu negócio? (Instagram, site, Google, LinkedIn ou outros)'],
  ['RX07','PRODUCT_MAIN_OFFER_RESULT','Produto','Produto',null,'Quais são seus principais produtos ou serviços e que resultado eles ajudam o cliente a alcançar?'],
  ['RX08','PRODUCT_TYPICAL_TARGET','Produto','Produto',null,'Quem costuma comprar de você hoje? Se ainda não for o público que deseja, quem você quer atrair?'],
  ['RX09','PRODUCT_OFFER_STRUCTURE_SCORE','Produto','Produto',null,'Hoje, seus produtos ou serviços estão organizados de forma clara, com opções e entregas bem definidas?'],
  ['RX10','PRODUCT_CLARITY_SCORE','Produto','Produto','Entender','Antes de falar com você, a pessoa consegue entender com clareza o que você vende, para quem é e o que ela vai receber?'],
  ['RX11','PRICE_DEFINITION_SCORE','Preço','Preço',null,'Hoje, como você decide quanto cobrar pelos seus produtos ou serviços?'],
  ['RX12','PRICE_VALUE_COMMUNICATION_SCORE','Preço','Preço','Avançar','Quando você fala o preço, a pessoa entende o que está recebendo e por que está pagando esse valor?'],
  ['RX13','PLACE_ACQUISITION_CONTROL_SCORE','Praça','Praça','Encontrar','Hoje, você sabe de onde vêm seus clientes e qual desses caminhos mais traz pessoas interessadas em comprar?'],
  ['RX14','PLACE_PURCHASE_PATH_SCORE','Praça','Praça','Avançar','Se a pessoa quiser seguir com você, está fácil pedir orçamento, agendar ou comprar?'],
  ['RX15','PROMOTION_CONSISTENCY_SCORE','Promoção','Promoção','Encontrar','Com que frequência sua empresa aparece nos canais que realmente usa para se comunicar?'],
  ['RX16','PROMOTION_MESSAGE_CLARITY_SCORE','Promoção','Promoção','Entender','Nos seus canais, está claro o que você faz e qual é o próximo passo para a pessoa seguir com você?'],
  ['RX17','PEOPLE_SALES_RESPONSIBILITY_SCORE','Pessoas','Pessoas','Avançar','Hoje, está bem definido quem atende a pessoa no início e quem leva essa conversa até a venda?'],
  ['RX18','PEOPLE_CAPACITY_DEPENDENCY_SCORE','Pessoas','Pessoas','Sustentar','Se a procura aumentar, o negócio consegue atender e entregar bem sem depender só de uma única pessoa?'],
  ['RX19','PROCESS_SALES_JOURNEY_SCORE','Processos','Processos','Avançar','Do primeiro contato até a venda, existe um passo a passo que costuma ser seguido?'],
  ['RX20','PROCESS_FOLLOWUP_LOSS_SCORE','Processos','Processos','Avançar','Quando alguém não compra ou fecha na hora, você faz contato depois e registra o motivo de não ter fechado?'],
  ['RX21','EVIDENCE_AVAILABILITY_SCORE','Evidências','Evidências físicas','Entender','Você já tem organizadas provas de que seu trabalho funciona, como depoimentos, avaliações, resultados, fotos ou exemplos de trabalhos realizados?'],
  ['RX22','EVIDENCE_VISIBILITY_SCORE','Evidências','Evidências físicas','Entender','Essas provas do seu trabalho aparecem para o cliente antes mesmo de ele precisar perguntar ou pedir referências?'],
  ['RX23','PRODUCTIVITY_METRICS_SCORE','Produtividade','Produtividade e Qualidade','Sustentar','Hoje, você acompanha números do negócio, como contatos, vendas, clientes ou resultados?'],
  ['RX24','PRODUCTIVITY_RECORDS_SCORE','Produtividade','Produtividade e Qualidade','Sustentar','Você consegue dizer, com base em algum registro, quantos contatos, clientes ou vendas entraram nos últimos 3 meses?'],
  ['RX25','CAPACITY_CURRENT_USE','Produtividade',null,null,'Em média, quantos clientes, atendimentos ou entregas você consegue fazer por mês, e quanto disso já costuma usar hoje?'],
  ['RX26','PATRIMONY_STRENGTHS','Patrimônio',null,null,'O que já funciona bem no seu negócio hoje e você considera um ponto forte que não abriria mão?'],
  ['RX27','DEMAND_DECLARED_DIFFICULTY','Investigação',null,null,'Na sua visão, qual é a maior dificuldade do seu negócio hoje?'],
  ['RX28','CONTEXT_ATTEMPTS','Investigação',null,null,'O que você já tentou fazer para resolver isso e qual foi o resultado?'],
  ['RX29','DESTINATION_90D','Destino',null,null,'Pensando nos próximos 90 dias, qual resultado você gostaria de alcançar?'],
  ['RX30','DESTINATION_SUCCESS_SIGNAL','Destino',null,null,'O que você conseguiria perceber, contar ou medir para ter certeza de que houve melhora?'],
];

const SCORE_OPTIONS = {
  RX09:['Não tenho opções claras; monto cada pedido do zero','Explico cada caso de um jeito','Tenho algumas opções, mas ainda mudo bastante o que entrego','Minhas principais opções têm entrega e limites claros','Minhas opções são claras, padronizadas e revisadas quando necessário'],
  RX10:['Não consegue entender','Quase sempre precisa perguntar o básico','Entende uma parte, mas ainda fica com dúvidas','Entende bem na maior parte dos canais','Entende com clareza e encontra a mesma mensagem nos principais canais'],
  RX11:['Decido na hora','Olho principalmente concorrentes ou uso minha intuição','Tenho algumas referências, mas sem um padrão claro','Tenho critérios definidos para cobrar','Tenho critérios, considero custos/valor e reviso os preços'],
  RX12:['Falo apenas o preço','A explicação muda muito de uma conversa para outra','Explico o básico, mas ainda surgem muitas dúvidas','Fica claro o que está incluído e o que a pessoa recebe','A apresentação é clara e eu também acompanho as principais dúvidas sobre preço'],
  RX13:['Não sei de onde vêm','Tenho uma ideia, mas não registro','Sei alguns caminhos, mas não comparo','Sei qual caminho mais traz pessoas interessadas e acompanho','Registro de onde vêm e acompanho quais caminhos geram mais avanço'],
  RX14:['Não existe um caminho claro','A pessoa precisa perguntar como fazer','Existe um caminho, mas ainda tem dificuldades','É fácil pedir orçamento, agendar ou comprar','Além de fácil, eu acompanho se esse caminho está funcionando'],
  RX15:['Minha empresa quase não aparece','Aparece raramente','Aparece, mas sem uma frequência definida','Tenho uma rotina de comunicação','Tenho rotina e planejamento do que será publicado/comunicado'],
  RX16:['Não está claro','A mensagem muda muito ou é genérica','Parte está clara, mas ainda há dúvidas','Está claro na maior parte dos canais','Está claro e coerente nos principais canais'],
  RX17:['Ninguém tem essa responsabilidade definida','Quem estiver disponível atende','Uma pessoa costuma cuidar, mas não há substituição clara','Está definido quem cuida e quem pode substituir','As responsabilidades e orientações estão bem definidas'],
  RX18:['Não sei ou acredito que não conseguiria','Quase tudo depende de uma única pessoa','Existe algum apoio, mas não sei quanto consigo atender','Sei quanto consigo atender e quem faz cada parte','Acompanho a capacidade e sei como aumentar quando necessário'],
  RX19:['Cada venda acontece de um jeito','Existe um jeito mais comum, mas muda bastante','Tenho algumas etapas, mas nem sempre sigo','Tenho um passo a passo e costumo seguir','O passo a passo é seguido, registrado e melhorado quando necessário'],
  RX20:['Não faço contato depois nem registro o motivo','Faço contato depois quando lembro','Às vezes faço contato, mas não registro os motivos de perda','Costumo fazer contato depois e registrar o motivo','O acompanhamento e o registro dos motivos fazem parte da rotina'],
  RX21:['Não tenho provas organizadas','Tenho algumas provas espalhadas','Tenho algumas reunidas','Tenho provas organizadas e atuais','Tenho diferentes tipos de provas, atuais e prontas para usar'],
  RX22:['As provas não aparecem','Só mostro quando a pessoa pede','Aparecem em alguns lugares','A pessoa encontra essas provas antes de decidir','As provas aparecem nos momentos certos para ajudar na decisão'],
  RX23:['Não acompanho números','Acompanho apenas números básicos, como visualizações ou seguidores','Acompanho alguns números de contatos, clientes ou vendas','Acompanho números importantes da venda e da operação','Acompanho, comparo com períodos anteriores e uso esses números para decidir'],
  RX24:['Não tenho registros','Consigo apenas estimar','Tenho registros de uma parte dos números','Tenho registros confiáveis dos principais números','Tenho registros organizados por origem ou etapa e uso isso para tomar decisões'],
};

// A simulação responde como a Yasmin responderia hoje, usando apenas dados da YM já conhecidos.
const A = {
  RX01:'Yasmin Menezes',
  RX02:'YM Marketing & Negócios',
  RX03:'Consultoria estratégica de marketing e negócios para pequenos negócios de serviços, especialmente empresas B2B baseadas em conhecimento, confiança, reputação e autoridade. Estruturo posicionamento, jornada digital e comercial, processos e crescimento usando o Método VOS — VER, ORDENAR e SUSTENTAR.',
  RX04:'Base em Belo Horizonte/MG. O atendimento consultivo pode acontecer online para clientes de outras regiões e presencialmente em Belo Horizonte quando fizer sentido para o projeto.',
  RX05:'A empresa foi constituída em 10/03/2026 e entrou em operação em 01/04/2026. A operação principal é conduzida por mim, com apoio da Lourdes em atividades como vídeos e postagens; automações e sistemas próprios apoiam a rotina.',
  RX06:'Site: https://ymnegocios.com.br · Instagram: @ym_marketingenegocios · LinkedIn: https://br.linkedin.com/in/yasmin-menezes-06a187193 · WhatsApp comercial conectado aos CTAs do site.',
  RX07:'A entrada é o Raio-X Estratégico. A oferta principal é a Fundação VOS, com formatos de implantação/acompanhamento. Também há soluções vinculadas ao diagnóstico, como posicionamento e marca, Instagram, LinkedIn, site e página de vendas, funil, WhatsApp Business, anúncios, Brand Book, campanhas e Fábrica de Conteúdo. O objetivo é organizar a jornada do negócio e implantar o que realmente precisa ser estruturado, em vez de começar por um canal isolado.',
  RX08:'Hoje quero atrair principalmente fundadoras, sócias e especialistas de pequenos negócios de serviços B2B, especialmente consultorias empresariais, RH, recrutamento e seleção, treinamento, desenvolvimento humano/organizacional e outros negócios baseados em conhecimento e autoridade. O negócio ideal já está em operação, já faz algum esforço de marketing e precisa conectar melhor posicionamento, captação, vendas e processos.',
  RX09:3,
  RX10:3,
  RX11:3,
  RX12:3,
  RX13:2,
  RX14:3,
  RX15:3,
  RX16:3,
  RX17:2,
  RX18:2,
  RX19:3,
  RX20:3,
  RX21:4,
  RX22:3,
  RX23:4,
  RX24:3,
  RX25:'A capacidade planejada é de até cerca de 10 clientes simultâneos. A carteira atual ainda ocupa apenas parte dessa capacidade, então existe espaço relevante para novos projetos. A consultoria e as decisões estratégicas ainda dependem bastante de mim, enquanto apoio operacional, automações e a Central YM reduzem parte da carga repetitiva.',
  RX26:'O Método VOS e a lógica de começar pelo diagnóstico antes da execução; a identidade e o posicionamento da marca; o Raio-X como produto de entrada; a capacidade de conectar marketing, vendas, processos, tecnologia e experiência do cliente; o site e a jornada digital já construídos; a Central YM/CRM e os sistemas próprios; os materiais e templates oficiais; além de casos, depoimentos e entregas reais já produzidos para clientes.',
  RX27:'Transformar a estrutura que já foi construída em aquisição previsível e vendas recorrentes. Hoje existem muitos ativos — método, marca, site, produto, CRM, conteúdo, provas e processo — mas a operação comercial e a prospecção ainda estão em consolidação e a YM ainda precisa ampliar presença e gerar conversas qualificadas com constância.',
  RX28:'Já estruturei site, posicionamento, produto de entrada, CRM/Central YM, funil, automações, conteúdos e materiais comerciais. Também iniciei prospecção ativa com uma base de dezenas de leads, Leituras Iniciais gratuitas, abordagens por LinkedIn/WhatsApp, produção de conteúdo e participação em ambientes de networking como o Sebrae. Isso já criou uma base comercial e oportunidades de conversa, mas ainda não virou uma cadência de vendas previsível o suficiente para a meta do negócio.',
  RX29:'Nos próximos 90 dias quero transformar a prospecção em uma operação comercial previsível, aumentar a entrada de leads qualificados e fechar clientes suficientes para sustentar uma receita mensal próxima de R$ 10 mil na YM, sem descaracterizar o posicionamento consultivo nem virar uma agência operacional.',
  RX30:'Vou considerar melhora quando eu conseguir acompanhar no CRM, de forma consistente, a origem e o volume de leads qualificados, conversas/reuniões, propostas, motivos de perda, novos clientes e receita; quando houver novos contratos vindos da prospecção e do digital; e quando a receita mensal se aproximar de R$ 10 mil com um pipeline que continue abastecido.',
};

const ITEM_P8 = {
  RX09:'Produto',RX10:'Produto',RX11:'Preço',RX12:'Preço',RX13:'Praça',RX14:'Praça',
  RX15:'Promoção',RX16:'Promoção',RX17:'Pessoas',RX18:'Pessoas',RX19:'Processos',RX20:'Processos',
  RX21:'Evidências físicas',RX22:'Evidências físicas',RX23:'Produtividade e Qualidade',RX24:'Produtividade e Qualidade'
};
const P8S = ['Produto','Preço','Praça','Promoção','Pessoas','Processos','Evidências físicas','Produtividade e Qualidade'];
const JOURNEY = {Encontrar:['RX13','RX15'],Entender:['RX10','RX16','RX21','RX22'],Avançar:['RX12','RX14','RX17','RX19','RX20'],Sustentar:['RX18','RX23','RX24']};

function avg(xs){return xs.reduce((a,b)=>a+b,0)/xs.length;}
function round1(n){return Math.round(n*10)/10;}
function scorePacket(){
  const p8_scores={};
  for(const p of P8S){
    const ids=Object.keys(ITEM_P8).filter(id=>ITEM_P8[id]===p);
    p8_scores[p]=round1(avg(ids.map(id=>A[id]/4*100)));
  }
  const overall=Math.round(avg(P8S.map(p=>p8_scores[p])));
  const journey_views={};
  for(const [k,ids] of Object.entries(JOURNEY)) journey_views[k]={score:round1(avg(ids.map(id=>A[id]/4*100))),valid:ids.length,total:ids.length};
  return {overall,coverage_pct:100,status:'FINAL',p8_scores,journey_views};
}

function interp(v){return v<=1?'PONTO_ATENCAO':v===2?'PARCIAL':'ATIVO';}
function p8Coverage(score){
  return P8S.map(p=>{
    const ids=Object.keys(ITEM_P8).filter(id=>ITEM_P8[id]===p);
    const vals=ids.map(id=>A[id]);
    const interps=vals.map(interp);
    let classification='PARCIAL';
    if(interps.every(x=>x==='ATIVO')) classification='ATIVO';
    else if(interps.every(x=>x==='PONTO_ATENCAO')) classification='PONTO_ATENCAO';
    else if(interps.includes('PARCIAL')) classification='PARCIAL';
    else classification='MISTA';
    return {p8:p,score:score.p8_scores[p],coverage:{valid:2,total:2,pct:100},classification};
  });
}

function patrimony(){
  const out=[{interpretation:'ATIVO',what:'Força declarada pelo dono do negócio',p8:null,origin:'RX26 — resposta aberta',why:'Reconhecer o que já sustenta o negócio evita quebrar o que dá certo ao organizar o resto.',detail:A.RX26}];
  for(const id of Object.keys(ITEM_P8)){
    if(A[id]>=3){
      out.push({interpretation:'ATIVO',what:`O negócio declara: "${SCORE_OPTIONS[id][A[id]]}".`,p8:ITEM_P8[id],origin:`${id} — nível ${A[id]}`,why:'Este sinal mostra uma prática já existente que pode ser preservada enquanto outras áreas são aprofundadas.'});
    }
  }
  return out;
}

function attention(){
  const out=[];
  for(const id of Object.keys(ITEM_P8)){
    if(A[id]===2){
      out.push({kind:'PARCIAL',p8:ITEM_P8[id],observation:`Parcial / precisa de validação em ${ITEM_P8[id]}.`,origin:`${id} — nível 2`,answer_given:SCORE_OPTIONS[id][2],possible_reading:'Existe alguma estrutura neste ponto, mas a própria resposta indica que ainda não está completamente consolidada.',probable_impact:'Vale validar para entender o quanto já está estabelecido.',confidence:'Baseado em uma resposta declarada pelo cliente.',limit:'Este ponto não define uma causa sozinho. Ele indica uma área que merece validação antes de qualquer implantação.'});
    }
  }
  return out;
}

function humanResponses(){
  return QUESTIONS.map(([id,field_id,block,p8,journey,question])=>{
    const isScore=Object.prototype.hasOwnProperty.call(SCORE_OPTIONS,id);
    return {question_id:id,field_id,block,p8,journey,question,answer:isScore?SCORE_OPTIONS[id][A[id]]:String(A[id]??''),response_type:isScore?'scale':'open'};
  });
}

function buildPacket(){
  const score=scorePacket();
  return {
    packet_version:'VOS_INTAKE_1.0',questionnaire_version:'RX_CANONICO_1.0',scoring_version:'RX_SCORE_1.0',report_version:REPORT_VERSION,
    source_product:'RAIO_X_ESTRATEGICO',source_system:'ym_raiox_homologacao',client_ref:'YM Marketing & Negócios',collected_at:new Date().toISOString(),
    score,p8_coverage:p8Coverage(score),patrimony:patrimony(),attention_points:attention(),gaps:[],initial_hypotheses:[],tips:['Escolher uma única área para validar a fundo numa conversa, começando pelo que já funciona bem.'],
    destination:{short_term:A.RX29,success_signal:A.RX30},
    limitations:['O Raio-X mostra ONDE aprofundar. Ele não fecha causa-raiz, prioridade final nem sequência de implantação.','As leituras por visão da jornada são recursos de interpretação, não uma ordem de correção.'],
    route_signal:null,route_label:'A VALIDAR',human_validation_required:true
  };
}

function inject(html, ref){
  const payload=JSON.stringify(A).replace(/</g,'\\u003c');
  const stamp=Date.now();
  let out=String(html||'');
  out=out.replace('<head>','<head><base href="https://ymnegocios.com.br/">');
  out=out.replace(/assets\/js\/raiox-v3\.1-persist\.js\?v=[^\"']+/g,`https://ymnegocios.com.br/assets/js/raiox-v3.1-persist.js?homolog=${stamp}`);
  out=out.replace(/assets\/js\/raiox-payment-shell-v1\.js\?v=[^\"']+/g,`https://ymnegocios.com.br/assets/js/raiox-payment-shell-v1.js?homolog=${stamp}`);
  out=out.replace(/assets\/js\/raiox-report-v1-1\.js\?v=[^\"']+/g,`https://ymnegocios.com.br/assets/js/raiox-report-v1-1.js?homolog=${stamp}`);
  const script=`<script id="ym-homolog-auto">
(function(root){
  'use strict';
  var ANSWERS=${payload};
  function start(){
    try{ if(root.localStorage){localStorage.removeItem('rx_draft_v1');localStorage.setItem('ym_raiox_ref','${ref}');} }catch(e){}
    root.A=ANSWERS;
    // Homologação: usa a interpretação oficial, mas não grava cliente/intake/oportunidade.
    root.persistRaioX=async function(packet){
      if(typeof root.YMPrepareRaioXInterpretation==='function'){
        try{await root.YMPrepareRaioXInterpretation(packet);}catch(e){console.warn('[YM HOMOLOG] interpretação avançada indisponível; usando relatório-base',e&&e.message);}
      }
      return {ok:true,homologacao:true,persisted:false};
    };
    if(typeof root.runAnalysis==='function') root.runAnalysis();
    else root.setTimeout(start,400);
  }
  root.setTimeout(start,1200);
})(window);
</script>`;
  return out.includes('</body>')?out.replace('</body>',script+'</body>'):out+script;
}

function htmlError(res,status,title,detail){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  return res.status(status).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Inter,Arial,sans-serif;background:#f7f8fc;color:#0b1533;padding:40px"><main style="max-width:680px;margin:auto;background:#fff;border:1px solid #e4e8f1;border-radius:20px;padding:28px"><h1>${title}</h1><p>${detail}</p></main></body></html>`);
}

async function tokenOk(token){
  if(!token) return false;
  const h=await sha256Hex(SALT+token);
  return comparacaoSegura(h,TOKEN_HASH);
}

export default async function handler(req,res){
  if(String(req.method||'').toUpperCase()!=='GET') return res.status(405).json({ok:false,error:'Método não permitido.'});
  if(!await tokenOk(String(req.query?.token||''))) return htmlError(res,403,'Acesso não autorizado','O link de homologação não é válido.');
  if(!temChaveRaioxInterpretativo) return htmlError(res,503,'Homologação indisponível','A camada interpretativa não está configurada.');

  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'desconhecido';
  if(temRedis){ const ok=await limitarTaxa(store,`homolog-ym:${ip}`,12); if(!ok) return htmlError(res,429,'Muitas tentativas','Aguarde um minuto e tente novamente.'); }

  if(String(req.query?.json||'')==='1'){
    try{
      const packet=buildPacket();
      const interpretation=await gerarInterpretacaoRaiox(packet,humanResponses());
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({ok:true,answers:A,packet,interpretation});
    }catch(e){
      log('error','Falha na homologação interpretativa da YM',{motivo:e.message});
      return res.status(502).json({ok:false,error:'Não foi possível concluir a interpretação da homologação.'});
    }
  }

  let ref=String(req.query?.ref||'').trim();
  if(!ref){
    if(!temRedis) return htmlError(res,503,'Homologação indisponível','O armazenamento de sessão não está disponível.');
    ref=gerarRef();
    const now=new Date().toISOString();
    await store.salvar(ref,{ref,status:STATUS.APPROVED,paymentId:null,customer:'YM Marketing & Negócios — HOMOLOGAÇÃO',value:0,origem:'homologacao_ym',createdAt:now,updatedAt:now});
    res.setHeader('Cache-Control','no-store');
    return res.redirect(302,`${SELF}?token=${encodeURIComponent(String(req.query.token))}&ref=${encodeURIComponent(ref)}`);
  }

  let registro;
  try{registro=await store.buscar(ref);}catch(e){return htmlError(res,503,'Homologação indisponível','Não foi possível validar a sessão.');}
  if(!registro||registro.status!==STATUS.APPROVED||registro.origem!=='homologacao_ym') return htmlError(res,403,'Sessão inválida','Esta sessão de homologação não está liberada.');

  try{
    const src=await fetch(OFFICIAL_HTML+'?homolog='+Date.now(),{headers:{'Cache-Control':'no-store'}});
    if(!src.ok) throw new Error('source_'+src.status);
    const html=inject(await src.text(),ref);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    return res.status(200).send(html);
  }catch(e){
    log('error','Falha ao servir homologação visual da YM',{motivo:e.message});
    return htmlError(res,502,'Não foi possível abrir a homologação','O Raio-X oficial não pôde ser carregado agora.');
  }
}
