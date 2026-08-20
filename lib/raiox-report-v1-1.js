/**
 * RX_REPORT_1.1 — camada interpretativa do Raio-X Estratégico YM.
 *
 * O Score e as classificações continuam sendo decididos pelo motor canônico.
 * Esta camada transforma respostas + sinais já calculados em LEITURA, sem
 * fechar causa-raiz, prioridade final, ordem de implantação ou produto.
 */
import { log } from './security.js';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = Number(process.env.RAIOX_REPORT_MAX_TOKENS || 6500);

export const temChaveRaioxInterpretativo = Boolean(API_KEY);
export const REPORT_VERSION = 'RX_REPORT_1.1';

const FORBIDDEN = [
  /causa[- ]raiz/i,
  /alta prioridade/i,
  /prioridade alta/i,
  /começar agora/i,
  /executar na sequência/i,
  /roadmap/i,
  /o próximo movimento é/i,
  /próximo produto/i,
  /\bfundação\b/i,
  /problema central/i,
];

const SYSTEM_PROMPT = `Você é a CAMADA INTERPRETATIVA do Raio-X Estratégico da YM Marketing & Negócios.

Seu trabalho NÃO é repetir o formulário. Seu trabalho é transformar dados declarados em leitura estratégica de alto nível.

REGRA-MÃE
CLIENTE FORNECE DADOS → RAIO-X DEVOLVE SIGNIFICADO.
Uma resposta copiada, resumida superficialmente ou apenas reescrita com sinônimos NÃO é uma entrega aceitável.

O motor canônico já calculou Score, cobertura dos 8Ps e classificações. Você NÃO recalcula notas e NÃO altera classificações.

LIMITES INEGOCIÁVEIS DO PRODUTO
- NÃO feche causa-raiz.
- NÃO declare prioridade final.
- NÃO crie ordem obrigatória de implantação.
- NÃO crie plano/roadmap de 30, 60 ou 90 dias.
- NÃO escolha serviço ou produto da YM.
- NÃO mencione Fundação, preço, proposta comercial ou contratação.
- NÃO transforme hipótese em fato.
- NÃO trate lacuna como defeito.
- NÃO invente dados de mercado, concorrência, benchmarks, SEO, algoritmo, conversão ou segmento.
- Use SOMENTE o packet canônico e as respostas humanas fornecidas.

COMO INTERPRETAR
1. DADO: o que a pessoa respondeu.
2. LEITURA: o que esse dado significa estrategicamente.
3. CONEXÃO: o que aparece quando esse dado é cruzado com outro dado.
A entrega deve privilegiar os níveis 2 e 3. O nível 1 serve de rastreabilidade, não de texto principal.

REGRAS DE TRANSFORMAÇÃO
- Nunca copie uma resposta aberta como texto final.
- Nunca use construções como “você informou que...” apenas para repetir a resposta.
- Resuma o modelo de negócio em linguagem executiva, preservando o sentido.
- Transforme RX29 em DESTINO ESTRATÉGICO, não em citação da meta.
- Transforme RX30 em SINAL DE SUCESSO interpretado, separando evidências qualitativas e quantitativas quando existirem.
- Quando dois dados parecem contraditórios, explique a diferença possível sem escolher uma causa. Ex.: clareza da oferta ≠ capacidade dos canais de comunicar a oferta.
- Diferencie claramente: patrimônio, ponto de atenção, leitura cruzada, hipótese e lacuna.
- Use linguagem simples e executiva. Evite jargão, frases motivacionais e generalidades.

RASTREABILIDADE
Toda leitura cruzada, patrimônio, ponto de atenção, hipótese e ganho rápido deve trazer sources com IDs RX válidos. Não cite fonte que não sustente a leitura.

CONFIANÇA
Use apenas: alta | media | baixa.
- alta: dois ou mais dados coerentes sustentam a leitura.
- media: um dado direto + outro sinal parcial, ou um único dado muito claro.
- baixa: leitura plausível que depende de validação adicional.

GANHOS RÁPIDOS
São testes seguros e pequenos, nunca uma sequência causal. Use verbos como testar, registrar, comparar, tornar visível, organizar para observar. Não prometa resultado.

SAÍDA
Devolva ESTRITAMENTE JSON válido, sem markdown e sem texto fora do JSON, com esta estrutura:
{
  "report_version":"RX_REPORT_1.1",
  "business_reading":{
    "headline":"1 linha: definição executiva do negócio, não cópia do RX03",
    "summary":"2-3 frases integrando RX03/RX04/RX05/RX07/RX08 quando disponíveis",
    "operating_context":"1-2 frases sobre como o negócio opera hoje, apenas se sustentado"
  },
  "destination":{
    "strategic_destination":"1-2 frases interpretando RX29 em nível estratégico",
    "success_signal":"1-2 frases interpretando RX30; diferencie sinais qualitativos/quantitativos quando houver"
  },
  "executive_synthesis":"3-5 frases: patrimônio + tensão principal observável + onde vale aprofundar. Sem causa-raiz.",
  "journey_reading":{
    "Encontrar":"leitura curta da visão, cruzando respostas pertinentes",
    "Entender":"leitura curta da visão, cruzando respostas pertinentes",
    "Avançar":"leitura curta da visão, cruzando respostas pertinentes",
    "Sustentar":"leitura curta da visão, cruzando respostas pertinentes"
  },
  "cross_readings":[
    {"title":"curto","reading":"o que a combinação de respostas revela","sources":["RXxx","RXyy"],"confidence":"alta|media|baixa","type":"leitura|hipotese"}
  ],
  "patrimony_readings":[
    {"title":"curto","reading":"qual ativo existe e por que importa","sources":["RXxx"]}
  ],
  "attention_readings":[
    {"title":"curto","reading":"o que merece atenção sem fechar causa","possible_impact":"impacto possível, com linguagem não causal","sources":["RXxx"],"confidence":"alta|media|baixa"}
  ],
  "hypotheses":[
    {"title":"curto","hypothesis":"hipótese explicitamente provisória","evidence":"o que sustenta","what_to_validate":"o que confirmar/refutar","sources":["RXxx"],"confidence":"alta|media|baixa"}
  ],
  "quick_wins":[
    {"title":"curto","test":"teste simples e seguro","why":"o que esse teste ajuda a descobrir/melhorar","sources":["RXxx"]}
  ],
  "not_to_decide":["decisão que seria prematura com os dados atuais"],
  "route_to_validate":{
    "reading":"síntese do tipo de aprofundamento que os dados pedem, sem escolher produto",
    "validation_questions":["pergunta objetiva que ajudaria a decidir o próximo passo"]
  }
}

LIMITES DE TAMANHO
- cross_readings: 3 a 5 itens.
- patrimony_readings: 3 a 5 itens.
- attention_readings: 2 a 5 itens, somente quando sustentados.
- hypotheses: 0 a 3 itens.
- quick_wins: 3 a 5 itens.
- not_to_decide: 2 a 4 itens.
- validation_questions: 2 a 4 itens.

Antes de responder, faça um teste mental: “se eu remover as respostas originais, este texto ainda demonstra uma interpretação?”. Se não, reescreva.`;

function cleanJson(texto) {
  return String(texto || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```$/, '')
    .trim();
}

function normalizeWords(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasLongCopiedSpan(output, responses, n = 9) {
  const outWords = normalizeWords(output);
  if (outWords.length < n) return false;
  const outNgrams = new Set();
  for (let i = 0; i <= outWords.length - n; i++) {
    outNgrams.add(outWords.slice(i, i + n).join(' '));
  }
  for (const r of responses || []) {
    if (r?.response_type !== 'open') continue;
    const words = normalizeWords(r.answer);
    if (words.length < n + 2) continue;
    for (let i = 0; i <= words.length - n; i++) {
      if (outNgrams.has(words.slice(i, i + n).join(' '))) return true;
    }
  }
  return false;
}

function allSourceIds(responses) {
  return new Set((responses || []).map(r => r?.question_id).filter(id => /^RX(?:0[1-9]|[12][0-9]|30)$/.test(id)));
}

function clampArray(v, min, max) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max);
}

function validateAndClamp(obj, responses) {
  if (!obj || typeof obj !== 'object') throw new Error('Interpretação vazia.');
  obj.report_version = REPORT_VERSION;

  const serialized = JSON.stringify(obj);
  for (const rx of FORBIDDEN) {
    if (rx.test(serialized)) throw new Error(`Conteúdo fora do escopo do Raio-X (${rx}).`);
  }
  if (hasLongCopiedSpan(serialized, responses)) {
    throw new Error('Interpretação reproduziu trecho longo de resposta aberta.');
  }

  const validIds = allSourceIds(responses);
  const checkSources = (item) => {
    const src = Array.isArray(item?.sources) ? item.sources : [];
    item.sources = [...new Set(src.filter(id => validIds.has(id)))].slice(0, 6);
    return item;
  };
  const checkConfidence = (item) => {
    if (!['alta', 'media', 'baixa'].includes(item?.confidence)) item.confidence = 'baixa';
    return item;
  };

  obj.cross_readings = clampArray(obj.cross_readings, 0, 5).map(checkConfidence).map(checkSources);
  obj.patrimony_readings = clampArray(obj.patrimony_readings, 0, 5).map(checkSources);
  obj.attention_readings = clampArray(obj.attention_readings, 0, 5).map(checkConfidence).map(checkSources);
  obj.hypotheses = clampArray(obj.hypotheses, 0, 3).map(checkConfidence).map(checkSources);
  obj.quick_wins = clampArray(obj.quick_wins, 0, 5).map(checkSources);
  obj.not_to_decide = clampArray(obj.not_to_decide, 0, 4);
  if (!obj.route_to_validate || typeof obj.route_to_validate !== 'object') obj.route_to_validate = {};
  obj.route_to_validate.validation_questions = clampArray(obj.route_to_validate.validation_questions, 0, 4);

  return obj;
}

async function callAnthropic(packet, responses, correction = null) {
  const payload = {
    packet_version: packet?.packet_version || null,
    questionnaire_version: packet?.questionnaire_version || null,
    scoring_version: packet?.scoring_version || null,
    score: packet?.score || null,
    p8_coverage: packet?.p8_coverage || [],
    patrimony: packet?.patrimony || [],
    attention_points: packet?.attention_points || [],
    gaps: packet?.gaps || [],
    destination_raw: packet?.destination || null,
    limitations: packet?.limitations || [],
    responses,
  };

  let userMsg = 'Interprete o Raio-X abaixo seguindo rigorosamente o contrato RX_REPORT_1.1.\n\nDADOS CANÔNICOS:\n' + JSON.stringify(payload, null, 2);
  if (correction) userMsg += '\n\nCORREÇÃO OBRIGATÓRIA DA TENTATIVA ANTERIOR:\n' + correction;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    log('error', 'Anthropic RX_REPORT_1.1 retornou erro', { status: resp.status, trecho: txt.slice(0, 180) });
    throw new Error(`Anthropic HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const texto = cleanJson((data.content || []).map(b => b.type === 'text' ? b.text : '').join(''));
  try {
    return JSON.parse(texto);
  } catch {
    log('error', 'RX_REPORT_1.1 não retornou JSON válido', { trecho: texto.slice(0, 220) });
    throw new Error('Resposta interpretativa fora do formato esperado.');
  }
}

export async function gerarInterpretacaoRaiox(packet, responses) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada.');
  if (!packet || typeof packet !== 'object') throw new Error('Packet ausente.');
  if (!Array.isArray(responses) || responses.length < 20) throw new Error('Respostas insuficientes para interpretação.');

  let primeira;
  try {
    primeira = await callAnthropic(packet, responses);
    return validateAndClamp(primeira, responses);
  } catch (e) {
    // Uma única revisão automática: evita entregar copy/paste ou conteúdo fora do escopo.
    const motivo = String(e?.message || 'falha de validação').slice(0, 220);
    log('warn', 'RX_REPORT_1.1 solicitando revisão automática', { motivo });
    const segunda = await callAnthropic(
      packet,
      responses,
      'A saída anterior foi rejeitada pelo guardrail: ' + motivo + '. Reescreva do zero, com mais interpretação, menos repetição e sem qualquer conteúdo fora do escopo.'
    );
    return validateAndClamp(segunda, responses);
  }
}
