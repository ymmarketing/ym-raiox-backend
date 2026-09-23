/**
 * Armazenamento do status de pagamento.
 *
 * Produção: Upstash Redis via REST (sem dependência, só fetch).
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Dev local: se as variáveis não existirem, usa memória — MAS avisa alto e claro.
 * Em serverless a memória NÃO persiste entre invocações: nunca use em produção.
 */

import { log } from './security.js';

const URL_REDIS = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_REDIS = process.env.UPSTASH_REDIS_REST_TOKEN;

export const temRedis = Boolean(URL_REDIS && TOKEN_REDIS);

/* ---------- fallback em memória (SOMENTE dev) ---------- */
const memoria = new Map();
let avisou = false;
function avisarMemoria() {
  if (!avisou) {
    avisou = true;
    log('error', 'ATENÇÃO: storage em memória. Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN. Serverless NÃO mantém estado entre invocações.');
  }
}

/* ---------- cliente Upstash REST ---------- */
async function comandoRedis(...args) {
  const resp = await fetch(URL_REDIS, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_REDIS}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Redis ${resp.status}: ${txt.slice(0, 160)}`);
  }
  const data = await resp.json();
  return data.result;
}

/* ---------- API do store ---------- */

const PREFIXO = 'ym:pagamento:';
const TTL_SEGUNDOS = 60 * 60 * 24 * 90; // 90 dias
const PREFIXO_IMAGEM = 'ym:raiox-img:';
const TTL_IMAGEM_SEGUNDOS = 60 * 60 * 24; // material bruto expira em 24 horas
const PREFIXO_TRAVA_GERACAO = 'ym:raiox-generation-lock:';
const TTL_TRAVA_GERACAO_SEGUNDOS = 60 * 7; // maior que o limite de 5 min da Function
const atualizacoesEmFila = new Map();

const PATCH_ATOMICO_LUA = `
local bruto = redis.call('GET', KEYS[1])
local atual = {}
if bruto then atual = cjson.decode(bruto) end
local patch = cjson.decode(ARGV[1])
for campo, valor in pairs(patch) do atual[campo] = valor end
atual.ref = ARGV[2]
atual.updatedAt = ARGV[3]
if not atual.createdAt then atual.createdAt = ARGV[3] end
if not atual.status then atual.status = 'pending' end
local novo = cjson.encode(atual)
redis.call('SET', KEYS[1], novo, 'EX', ARGV[4])
return novo
`;

const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export const store = {
  disponivel: temRedis,

  async salvar(ref, dados) {
    const chave = PREFIXO + ref;
    const valor = JSON.stringify(dados);
    if (!temRedis) {
      avisarMemoria();
      memoria.set(chave, valor);
      return true;
    }
    await comandoRedis('SET', chave, valor, 'EX', String(TTL_SEGUNDOS));
    return true;
  },

  async buscar(ref) {
    const chave = PREFIXO + ref;
    let bruto;
    if (!temRedis) {
      avisarMemoria();
      bruto = memoria.get(chave);
    } else {
      bruto = await comandoRedis('GET', chave);
    }
    if (!bruto) return null;
    try {
      return typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
    } catch {
      return null;
    }
  },

  /** Atualiza campos preservando o que já existe. Cria se não existir. */
  async atualizar(ref, patch) {
    const chave = PREFIXO + ref;
    const updatedAt = new Date().toISOString();
    if (!temRedis) {
      const anterior = atualizacoesEmFila.get(chave) || Promise.resolve();
      const tarefa = anterior.catch(() => {}).then(async () => {
        const atual = (await this.buscar(ref)) || {};
        const novo = {
          ref,
          status: 'pending',
          createdAt: atual.createdAt || updatedAt,
          ...atual,
          ...patch,
          ref,
          updatedAt,
        };
        await this.salvar(ref, novo);
        return novo;
      });
      atualizacoesEmFila.set(chave, tarefa);
      try { return await tarefa; }
      finally { if (atualizacoesEmFila.get(chave) === tarefa) atualizacoesEmFila.delete(chave); }
    }
    const bruto = await comandoRedis(
      'EVAL', PATCH_ATOMICO_LUA, '1', chave,
      JSON.stringify(patch || {}), ref, updatedAt, String(TTL_SEGUNDOS),
    );
    return typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
  },

  /** Guarda temporariamente uma imagem do Raio-X sem misturá-la ao JSON da sessão. */
  async salvarImagem(ref, imageId, dataUrl) {
    const chave = `${PREFIXO_IMAGEM}${ref}:${imageId}`;
    if (!temRedis) {
      avisarMemoria();
      memoria.set(chave, dataUrl);
      return true;
    }
    await comandoRedis('SET', chave, dataUrl, 'EX', String(TTL_IMAGEM_SEGUNDOS));
    return true;
  },

  async buscarImagem(ref, imageId) {
    const chave = `${PREFIXO_IMAGEM}${ref}:${imageId}`;
    if (!temRedis) {
      avisarMemoria();
      return memoria.get(chave) || null;
    }
    return (await comandoRedis('GET', chave)) || null;
  },

  async removerImagem(ref, imageId) {
    const chave = `${PREFIXO_IMAGEM}${ref}:${imageId}`;
    if (!temRedis) {
      memoria.delete(chave);
      return true;
    }
    await comandoRedis('DEL', chave);
    return true;
  },

  /**
   * Reserva atômica da geração paga. Somente a primeira requisição para a
   * mesma referência entra; as demais recebem false sem chamar a IA.
   */
  async adquirirTravaGeracao(ref, token, ttlSegundos = TTL_TRAVA_GERACAO_SEGUNDOS) {
    const chave = `${PREFIXO_TRAVA_GERACAO}${ref}`;
    const valor = String(token || '');
    if (!valor) return false;
    if (!temRedis) {
      avisarMemoria();
      if (memoria.has(chave)) return false;
      memoria.set(chave, valor);
      return true;
    }
    const r = await comandoRedis('SET', chave, valor, 'NX', 'EX', String(ttlSegundos));
    return r !== null;
  },

  /** Libera a trava apenas quando o chamador ainda é o proprietário. */
  async liberarTravaGeracao(ref, token) {
    const chave = `${PREFIXO_TRAVA_GERACAO}${ref}`;
    const valor = String(token || '');
    if (!valor) return false;
    if (!temRedis) {
      if (memoria.get(chave) !== valor) return false;
      memoria.delete(chave);
      return true;
    }
    const r = await comandoRedis('EVAL', RELEASE_LOCK_LUA, '1', chave, valor);
    return Number(r) === 1;
  },

  /** Índice paymentId -> ref, para o webhook achar a referência se faltar externalReference. */
  async indexarPagamento(paymentId, ref) {
    if (!paymentId) return;
    const chave = `ym:payid:${paymentId}`;
    if (!temRedis) {
      avisarMemoria();
      memoria.set(chave, ref);
      return;
    }
    await comandoRedis('SET', chave, ref, 'EX', String(TTL_SEGUNDOS));
  },

  async refPorPagamento(paymentId) {
    if (!paymentId) return null;
    const chave = `ym:payid:${paymentId}`;
    if (!temRedis) {
      avisarMemoria();
      return memoria.get(chave) || null;
    }
    return (await comandoRedis('GET', chave)) || null;
  },

  /** Incremento com expiração (para rate limit). */
  async incr(chave, ttlSegundos = 120) {
    if (!temRedis) {
      avisarMemoria();
      const n = (Number(memoria.get(chave)) || 0) + 1;
      memoria.set(chave, String(n));
      return n;
    }
    const n = await comandoRedis('INCR', chave);
    if (n === 1) await comandoRedis('EXPIRE', chave, String(ttlSegundos));
    return n;
  },

  /** Idempotência do webhook: guarda o id do evento já processado. */
  async eventoJaProcessado(eventId) {
    if (!eventId) return false;
    const chave = `ym:evt:${eventId}`;
    if (!temRedis) {
      avisarMemoria();
      if (memoria.has(chave)) return true;
      memoria.set(chave, '1');
      return false;
    }
    // SET NX: só grava se não existir. Retorna null se já existia.
    const r = await comandoRedis('SET', chave, '1', 'NX', 'EX', String(60 * 60 * 24 * 14));
    return r === null;
  },

  /**
   * Resgate de código de acesso — UMA VEZ SÓ, de verdade.
   * A marca vive no Redis, não no navegador: limpar cookies não devolve o código.
   */
  async codigoJaResgatado(hash) {
    const chave = `ym:codigo:${hash}`;
    if (!temRedis) {
      avisarMemoria();
      return memoria.has(chave);
    }
    const r = await comandoRedis('GET', chave);
    return r !== null && r !== undefined;
  },

  /** Marca o código como resgatado. Atômico: SET NX. Devolve false se já existia. */
  async marcarCodigoResgatado(hash, ref) {
    const chave = `ym:codigo:${hash}`;
    const valor = JSON.stringify({ ref, resgatadoEm: new Date().toISOString() });
    if (!temRedis) {
      avisarMemoria();
      if (memoria.has(chave)) return false;
      memoria.set(chave, valor);
      return true;
    }
    // sem EX: o resgate é permanente
    const r = await comandoRedis('SET', chave, valor, 'NX');
    return r !== null;
  },

  async ping() {
    if (!temRedis) return { ok: false, tipo: 'memoria' };
    const r = await comandoRedis('PING');
    return { ok: r === 'PONG', tipo: 'upstash' };
  },
};

/* ---------- estados válidos ---------- */
export const STATUS = Object.freeze({
  PENDING: 'pending',
  AWAITING_PIX: 'awaiting_pix',
  APPROVED: 'approved',
  REFUSED: 'refused',
  EXPIRED: 'expired',
  CANCELED: 'canceled',
  REFUNDED: 'refunded',
  ERROR: 'error',
});

export const STATUS_VALIDOS = Object.values(STATUS);
