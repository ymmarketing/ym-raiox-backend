/**
 * POST /api/acesso/manual
 *
 * CONTINGÊNCIA OFICIAL. Valida um código de acesso e, se for válido,
 * cria no Redis uma referência já aprovada — a mesma coisa que o webhook
 * do Asaas cria quando alguém paga.
 *
 * Com isso, existe UM único mecanismo de autorização: a ref aprovada no
 * servidor. O front não decide nada.
 *
 * Body: { codigo: "YM-XXXX-XXXX" }
 * Resp: { ok: true, ref: "ym_raiox_..._manual", status: "approved" }
 *       { ok: false, error: "..." }   (403 / 429)
 *
 * Uso único DE VERDADE: a marca de resgate fica no Redis, não no navegador.
 * Limpar cookies ou abrir aba anônima não devolve o código.
 *
 * Os códigos não estão aqui em texto: só o SHA-256 de cada um.
 * Para gerar novos, rode `gerar_codigos.py` e substitua a lista.
 */

import { aplicarCors, exigirMetodo } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import {
  comparacaoSegura,
  log,
  texto,
  limitarTaxa,
  sha256Hex,
} from '../../lib/security.js';
import {
  codigoMestreExecucaoValido,
  statusMestreExecucao,
} from '../../lib/execution-master.js';

/* sal do projeto — precisa bater com o usado em gerar_codigos.py */
const CODIGO_SALT = process.env.CODIGO_SALT || 'YM-RAIOX-2026';

/* hashes dos 20 códigos de cliente (uso único, resgate registrado no Redis).
   Os códigos em si não estão aqui: hash é via de mão única.

   A lista é exportada para que a suíte de testes possa substituí-la por
   hashes fictícios — assim os códigos reais nunca entram no repositório. */
export const CODIGOS_HASH = [
  '9984d06e8fdce511cdf2aa73fac6ca60adc9d1314097e8f04d6ae78f30e0c451',
  '083fc5db93c8ff8544acf0d38445bed1888c717747cfee1dccbf5a74f7bfeb24',
  'c15fddb9ddc714726d89adf2d2bab9a9d34b686d4ebd7fae6fee188705768639',
  '26a617af706c39275cd25456035f3cbca7cf80b697ac961be57f6f94e9c01797',
  'b82d64293203cee0db6ce8fb6e700300538535d2da6e5c300a3d8cd01f86c584',
  '3ac6f7bdc71eddca927bf86f242fe386e4d12e87f85ae601e28241c6e68f3f6f',
  '79b9830788c1d6126129791e4ca499e800d7f1776c41aa3cc3062e12cca702e1',
  '331a02b2e89113c3e91632fcd9eaa2c56c79bf8d209128bad1dc061d7df6c9f1',
  '3825695c89f9e963a03387f69880862c32f506086bcbbcec6766b03bf8846ee9',
  '135d56a020dce507c2fd72c126a4ac0fc1c25e67b4b9fbea3ff2eada92115a23',
  'c7838da997e0b9172ef7e50a7762cf1424cfd2539df31767f73e4414c76a9c73',
  '13f32ea5945bcc7a73b9d0d72e62c7249b35f7aca0e8b236c04312a63bb36264',
  'eafd8d900016c5102c27cc40eea13dc5e6e91c6abc498943ae61436dd47dcd17',
  'e2e91a29010bf14bfecd5ef70d99c624b74670dcd6bf70913d66d5dd12eecc39',
  'fa24ab7bf226484ac83a391985ff98bc2d0f3dca9327195e1cdb56e41cd0cbe8',
  '50ee485d9d587bf3ff9e02268325c3699136072b949b52b2b8984d659f432ffd',
  '6feb2efd6566dca97c8068f47611c1d7620ae14e50338da8c84d163a0a257fc9',
  '28fc388ecf2e4a4ec32b4e84c7611313f760ada7f0cbe81e5e748e80ef6e691a',
  '28340143bca68883171b01f71a1673ddf843a06edb646bdc9af389fe5e7f21a0',
  '73699940358398050681dc5b40c5b5decd2bf74bc683916dbc710b39c4d63ff9'
];

/* código-mestre: lido A CADA REQUISIÇÃO (não no import).
   Assim, apagar a variável na Vercel tem efeito imediato após o redeploy,
   e o comportamento é o mesmo em teste e em produção.

   TRAVA DE AMBIENTE: em ASAAS_ENV=production o mestre é SEMPRE recusado,
   mesmo que a variável tenha ficado cadastrada por esquecimento.
   Só existe código-mestre em sandbox. */
function codigoMestreAtual() {
  const ambiente = (process.env.ASAAS_ENV || 'production').toLowerCase();
  if (ambiente === 'production') return '';
  return (process.env.CODIGO_MESTRE || '').trim();
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  if (exigirMetodo(req, res, 'POST')) return;

  if (!temRedis) {
    log('error', 'Acesso manual sem storage configurado.');
    return res.status(503).json({
      ok: false,
      error: 'Serviço indisponível. Fale conosco pelo WhatsApp.',
    });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'desconhecido';

  /* força bruta: 5 tentativas por minuto por IP */
  const ok = await limitarTaxa(store, `manual:${ip}`, 5);
  if (!ok) {
    log('warn', 'Rate limit no acesso manual.', { ip });
    return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde um minuto.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const codigo = texto(body?.codigo, 40).trim().toUpperCase();
  if (!codigo || codigo.length < 6) {
    return res.status(400).json({ ok: false, error: 'Código inválido.' });
  }

  /* ───────── 1. código-mestre (staging) ───────── */
  const mestre = codigoMestreAtual();
  if (mestre && comparacaoSegura(codigo, mestre.toUpperCase())) {
    const ref = `ym_raiox_${Date.now()}_mestre${Math.random().toString(16).slice(2, 10)}`;
    await store.salvar(ref, {
      ref,
      status: STATUS.APPROVED,
      paymentId: null,
      customer: 'MESTRE (staging)',
      value: 0,
      origem: 'codigo_mestre',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    log('info', 'Acesso liberado pelo código-mestre.', { ip, ref });
    return res.status(200).json({ ok: true, ref, status: STATUS.APPROVED, tipo: 'mestre' });
  }

  /* ───────── 2. mestre temporário de execução (inclusive produção) ─────────
     Usado apenas durante a contingência operacional sem Asaas. O código é
     reutilizável, mas expira automaticamente e só o hash salgado é publicado. */
  if (codigoMestreExecucaoValido(codigo)) {
    const ref = `ym_raiox_${Date.now()}_mestreexec${Math.random().toString(16).slice(2, 10)}`;
    const mestreExecucao = statusMestreExecucao();
    await store.salvar(ref, {
      ref,
      status: STATUS.APPROVED,
      paymentId: null,
      customer: 'MESTRE EXECUÇÃO TEMPORÁRIA',
      value: 0,
      origem: 'codigo_mestre_execucao',
      expiraEm: mestreExecucao.expiraEm,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    log('info', 'Acesso liberado pelo mestre temporário de execução.', {
      ip,
      ref,
      expiraEm: mestreExecucao.expiraEm,
    });
    return res.status(200).json({
      ok: true,
      ref,
      status: STATUS.APPROVED,
      tipo: 'mestre_execucao',
    });
  }

  /* ───────── 3. código de cliente (uso único) ───────── */
  const hash = await sha256Hex(CODIGO_SALT + codigo);

  if (!CODIGOS_HASH.includes(hash)) {
    log('warn', 'Código de acesso não reconhecido.', { ip });
    return res.status(403).json({ ok: false, error: 'Código não reconhecido.' });
  }

  /* resgate ATÔMICO: reserva o código antes de criar a ref.
     SET NX numa só operação — duas requisições simultâneas não passam ambas. */
  const ref = `ym_raiox_${Date.now()}_manual${Math.random().toString(16).slice(2, 10)}`;
  const reservou = await store.marcarCodigoResgatado(hash, ref);

  if (!reservou) {
    log('warn', 'Código já utilizado.', { ip, hash: hash.slice(0, 8) });
    return res.status(403).json({
      ok: false,
      error: 'Este código já foi utilizado.',
      jaUsado: true,
    });
  }

  await store.salvar(ref, {
    ref,
    status: STATUS.APPROVED,
    paymentId: null,
    customer: 'ACESSO MANUAL',
    value: Number(process.env.PRODUCT_PRICE || 97),
    origem: 'codigo_manual',
    codigoHash: hash.slice(0, 12),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  log('info', 'Acesso liberado por código manual.', { ip, ref, hash: hash.slice(0, 8) });
  return res.status(200).json({ ok: true, ref, status: STATUS.APPROVED, tipo: 'manual' });
}
