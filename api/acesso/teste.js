/**
 * GET/POST /api/acesso/teste
 *
 * Acessos de uso único para teste end-to-end do Raio-X oficial.
 * Não cria cobrança no Asaas. Cada token cria uma referência aprovada no
 * mesmo store usado pelo fluxo real, permitindo testar questionário, análise,
 * relatório e persistência sem gerar receita.
 */
import { aplicarCors } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { comparacaoSegura, log, texto, limitarTaxa, sha256Hex } from '../../lib/security.js';

const TEST_SALT = 'YM-RAIOX-TEST-2026';
const TEST_TOKEN_HASHES = [
  '35bbf42ba5982175139bb90c9f375d9314a1b2a7f05021017638ded028e976f7',
  '5dcd49bceacd2ed22fdb93270c702a1828432e88c0e99b19995d1a2c123ab117'
];
const RAIOX_URL = 'https://ymnegocios.com.br/raio-x.html';

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;

  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

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

  const token = texto(method === 'GET' ? req.query?.token : body?.token, 100).trim();
  if (!token) return res.status(400).json({ ok: false, error: 'Token ausente.' });

  const hash = await sha256Hex(TEST_SALT + token);
  const tokenHash = TEST_TOKEN_HASHES.find((h) => comparacaoSegura(hash, h));
  if (!tokenHash) {
    log('warn', 'Token de teste inválido.', { ip });
    return res.status(403).json({ ok: false, error: 'Token inválido.' });
  }

  const ref = `ym_raiox_${Date.now()}_teste${Math.random().toString(16).slice(2, 10)}`;
  const reservou = await store.marcarCodigoResgatado(tokenHash, ref);
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

  if (method === 'GET') {
    const destino = `${RAIOX_URL}?ref=${encodeURIComponent(ref)}&teste_execucao=1`;
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, destino);
  }

  return res.status(200).json({ ok: true, ref, status: STATUS.APPROVED, tipo: 'teste_execucao' });
}
