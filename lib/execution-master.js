import crypto from 'node:crypto';

/*
 * Contingência temporária de execução do Raio-X sem Asaas.
 *
 * O código em texto nunca fica no repositório. Somente o SHA-256 salgado é
 * publicado. A validade curta reduz o risco de um código reutilizável ficar
 * ativo por esquecimento. As variáveis de ambiente permitem trocar ou revogar
 * o acesso sem alterar esta interface.
 */
const HASH_PADRAO = '21d4c93e2215bd05695ca7f2325c1051408a8f451721366d312ecdf5a73caffd';
const EXPIRACAO_PADRAO = '2026-10-22T02:59:59.000Z';
const SAL_PADRAO = 'YM-RAIOX-2026';

function configuracao() {
  return {
    hash: String(process.env.CODIGO_EXECUCAO_MESTRE_HASH || HASH_PADRAO).trim().toLowerCase(),
    expiraEm: String(process.env.CODIGO_EXECUCAO_MESTRE_EXPIRA_EM || EXPIRACAO_PADRAO).trim(),
    salt: String(process.env.CODIGO_SALT || SAL_PADRAO),
  };
}

export function statusMestreExecucao(agora = new Date()) {
  const { hash, expiraEm } = configuracao();
  const expiraMs = Date.parse(expiraEm);
  const hashValido = /^[a-f0-9]{64}$/.test(hash);
  const dataValida = Number.isFinite(expiraMs);
  return {
    ativo: hashValido && dataValida && agora.getTime() < expiraMs,
    expiraEm: dataValida ? new Date(expiraMs).toISOString() : null,
  };
}

export function codigoMestreExecucaoValido(codigo, agora = new Date()) {
  const status = statusMestreExecucao(agora);
  if (!status.ativo) return false;

  const { hash, salt } = configuracao();
  const recebido = crypto
    .createHash('sha256')
    .update(salt + String(codigo || '').trim().toUpperCase())
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(recebido, 'hex'), Buffer.from(hash, 'hex'));
}
