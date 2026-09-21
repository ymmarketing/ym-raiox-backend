/**
 * Utilidades de segurança.
 *
 * REGRA: nada aqui pode imprimir chave, token ou dado sensível em log.
 */

import crypto from 'node:crypto';

/**
 * Comparação de strings em tempo constante.
 * Evita que um atacante descubra o token medindo o tempo de resposta.
 */
export function comparacaoSegura(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) {
    // ainda assim gasta tempo, para não vazar o tamanho
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Gera a referência única da compra.
 * Formato: ym_raiox_<timestamp>_<random>
 * Ex.: ym_raiox_1751337600000_a3f9c1d2e4b5
 */
export function gerarRef() {
  const ts = Date.now();
  const rnd = crypto.randomBytes(6).toString('hex');
  return `ym_raiox_${ts}_${rnd}`;
}

/** Valida o formato da referência (evita chave arbitrária no storage).
 *  Aceita:
 *    ym_raiox_<ts>_<hex>              → pagamento normal
 *    ym_raiox_<ts>_manual<hex>        → código de acesso resgatado
 *    ym_raiox_<ts>_mestre<hex>        → código-mestre (staging)
 *    ym_raiox_<ts>_mestreexec<hex>    → mestre temporário de execução
 */
export function refValida(ref) {
  return (
    typeof ref === 'string' &&
    /^ym_raiox_\d{10,}_(manual|mestreexec|mestre)?[a-f0-9]{8,}$/.test(ref)
  );
}

/**
 * Mascara valores sensíveis antes de logar.
 * Nunca logue o retorno de process.env diretamente.
 */
export function mascarar(valor) {
  const s = String(valor || '');
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

/** Log estruturado e seguro. */
export function log(nivel, mensagem, extra = {}) {
  const limpo = {};
  for (const [k, v] of Object.entries(extra)) {
    if (/token|key|secret|senha|password|authorization/i.test(k)) {
      limpo[k] = '[REDACTED]';
    } else {
      limpo[k] = v;
    }
  }
  const linha = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    mensagem,
    ...limpo,
  });
  if (nivel === 'error') console.error(linha);
  else console.log(linha);
}

/** Erro seguro para devolver ao cliente (sem stack, sem detalhe interno). */
export function erroSeguro(res, status, mensagem, contexto = {}) {
  log('error', mensagem, contexto);
  res.status(status).json({ ok: false, error: mensagem });
}

/**
 * Rate limit simples por IP, usando o storage (Redis).
 * Não é blindagem contra DDoS — é para conter abuso trivial da rota de criação.
 */
export async function limitarTaxa(store, chave, maxPorMinuto = 10) {
  try {
    const janela = Math.floor(Date.now() / 60000);
    const k = `rl:${chave}:${janela}`;
    const n = await store.incr(k, 120); // expira em 2 min
    return n <= maxPorMinuto;
  } catch {
    return true; // se o storage falhar, não bloqueia o cliente legítimo
  }
}

/** SHA-256 em hex. Usado para validar os códigos de acesso sem guardá-los. */
export async function sha256Hex(entrada) {
  return crypto.createHash('sha256').update(String(entrada), 'utf8').digest('hex');
}

/** Sanitiza texto curto vindo do cliente (nome, email). */
export function texto(v, max = 120) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max).replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Valida e-mail de forma tolerante (não bloqueia venda por regex exótica). */
export function emailValido(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** Só dígitos (telefone, CPF/CNPJ). */
export function digitos(v, max = 20) {
  return String(v || '').replace(/\D/g, '').slice(0, max);
}
