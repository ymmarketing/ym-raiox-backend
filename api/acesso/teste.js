/**
 * POST /api/acesso/teste
 *
 * Acesso de uso único para teste end-to-end do Raio-X oficial.
 * Não cria cobrança no Asaas. Cria uma referência aprovada no mesmo store
 * usado pelo fluxo real, permitindo testar questionário, análise, relatório
 * e persistência sem gerar receita.
 *
 * Body: { token: "..." }
 */
import { aplicarCors, exigirMetodo } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { comparacaoSegura, log, texto, limitarTaxa, sha256Hex } from '../../lib/security.js';

const TEST_SALT = 'YM-RAIOX-TEST-2026';
const TEST_TOKEN_HASH = 'c3fe3cea7bdb9d3608e68be8c39ce33dcff8d3fe820f04739141d1c823ba85dc';

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  if (exigirMetodo(req, res, 'POST')) return;

  if (!temRedis) {
    log('error', 'Acesso de teste sem storage configurado.');
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'desconhecido';

  const liberado = await limitarTaxa(store, `teste:${ip}`, 5);
  if (!liberado) {
    return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde um minuto.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const token = texto(body?.token, 100).trim();
  if (!token) return res.status(400).json({ ok: false, error: 'Token ausente.' });

  const hash = await sha256Hex(TEST_SALT + token);
  if (!comparacaoSegura(hash, TEST_TOKEN_HASH)) {
    log('warn', 'Token de teste inválido.', { ip });
    return res.status(403).json({ ok: false, error: 'Token inválido.' });
  }

  const ref = `ym_raiox_${Date.now()}_teste${Math.random().toString(16).slice(2, 10)}`;
  const reservou = await store.marcarCodigoResgatado(TEST_TOKEN_HASH, ref);
  if (!reservou) {
    return res.status(403).json({ ok: false, error: 'Este link de teste já foi utilizado.', jaUsado: true });
  }

  const now = new Date().toISOString();
  await store.salvar(ref, {
    ref,
    status: STATUS.APPROVED,
    paymentId: null,
    customer: 'TESTE EXECUÇÃO YM',
    value: 0,
    origem: 'teste_execucao',
    createdAt: now,
    updatedAt: now,
  });

  log('info', 'Acesso de teste end-to-end liberado.', { ip, ref });
  return res.status(200).json({ ok: true, ref, status: STATUS.APPROVED, tipo: 'teste_execucao' });
}
