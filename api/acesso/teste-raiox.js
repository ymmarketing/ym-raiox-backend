/**
 * GET /api/acesso/teste-raiox?token=...
 * GET /api/acesso/teste-raiox?ref=...&teste_execucao=1
 *
 * Teste end-to-end do Raio-X oficial sem cobrança. A segunda etapa serve o
 * HTML oficial da YM em modo de teste e adiciona apenas um guardrail: falha de
 * persistência não pode impedir a exibição do relatório.
 */
import { aplicarCors } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { comparacaoSegura, log, texto, limitarTaxa, sha256Hex, refValida } from '../../lib/security.js';

const TEST_SALT = 'YM-RAIOX-TEST-2026';
const TEST_TOKEN_HASHES = [
  '2d5be0faf2df82958779871adae27c5f766ef61acad0119b7d0cfe3eb444408a',
  'd06e579a71a8ae56809ffe9cdd8223e72dfa21f71bd62ef215d7eb84447fad4c'
];
const RAIOX_SOURCE = 'https://ymnegocios.com.br/raio-x.html';
const CANONICAL_SELF = 'https://ym-raiox-backend.vercel.app/api/acesso/teste-raiox';

function htmlError(res, status, title, detail) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Inter,Arial,sans-serif;background:#f7f8fc;color:#0b1533;padding:40px"><main style="max-width:680px;margin:auto;background:white;border:1px solid #e4e8f1;border-radius:20px;padding:28px"><h1 style="font-size:22px">${title}</h1><p style="line-height:1.6;color:#68748e">${detail}</p></main></body></html>`);
}

function injectTestGuard(html) {
  const stamp = Date.now();
  let out = String(html || '');
  out = out.replace('<head>', '<head><base href="https://ymnegocios.com.br/">');

  // Evita reaproveitar no navegador uma versão anterior dos JS durante o teste.
  out = out.replace(/assets\/js\/raiox-v3\.1-persist\.js\?v=[^\"']+/g, `https://ymnegocios.com.br/assets/js/raiox-v3.1-persist.js?test=${stamp}`);
  out = out.replace(/assets\/js\/raiox-payment-shell-v1\.js\?v=[^\"']+/g, `https://ymnegocios.com.br/assets/js/raiox-payment-shell-v1.js?test=${stamp}`);
  out = out.replace(/assets\/js\/raiox-report-v1-1\.js\?v=[^\"']+/g, `https://ymnegocios.com.br/assets/js/raiox-report-v1-1.js?test=${stamp}`);

  const guard = `<script id="ym-raiox-test-result-guard">
(function(root){
  'use strict';
  root.__YM_RX_TEST_PROXY__=true;
  function patch(){
    var current=root.persistRaioX;
    if(typeof current!=='function'||current.__YM_TEST_RESULT_GUARD__)return;
    var wrapped=async function(packet){
      try{return await current(packet);}
      catch(e){
        var msg=(e&&e.message)||'falha_de_persistencia';
        console.warn('[YM RX TEST] persistência não bloqueou o relatório:',msg);
        root.__YM_RAIOX_TEST_PERSIST_WARNING__=msg;
        return {ok:true,test_mode:true,persisted:false,warning:msg};
      }
    };
    wrapped.__YM_TEST_RESULT_GUARD__=true;
    root.persistRaioX=wrapped;
  }
  patch();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch);
  root.setTimeout(patch,0);root.setTimeout(patch,500);root.setTimeout(patch,1500);
})(window);
</script>`;

  return out.includes('</body>') ? out.replace('</body>', guard + '</body>') : out + guard;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  if (String(req.method || '').toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok:false, error:'Método não permitido.' });
  }
  if (!temRedis) return htmlError(res, 503, 'Teste temporariamente indisponível', 'O armazenamento de sessão não está disponível agora.');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido';
  const rateOk = await limitarTaxa(store, `teste-raiox:${ip}`, 8);
  if (!rateOk) return htmlError(res, 429, 'Muitas tentativas', 'Aguarde um minuto e tente novamente.');

  const ref = texto(req.query?.ref, 220).trim();
  if (ref) {
    if (!refValida(ref)) return htmlError(res, 403, 'Acesso inválido', 'A referência deste teste não é válida.');
    let registro;
    try { registro = await store.buscar(ref); }
    catch { return htmlError(res, 503, 'Teste temporariamente indisponível', 'Não foi possível validar a sessão de teste.'); }
    if (!registro || registro.status !== STATUS.APPROVED || registro.origem !== 'teste_execucao') {
      return htmlError(res, 403, 'Acesso não autorizado', 'Este teste não está liberado ou já não está disponível.');
    }

    try {
      const source = await fetch(RAIOX_SOURCE + '?proxy=' + Date.now(), { headers:{ 'Cache-Control':'no-store' } });
      if (!source.ok) throw new Error('source_' + source.status);
      const officialHtml = await source.text();
      const finalHtml = injectTestGuard(officialHtml);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.status(200).send(finalHtml);
    } catch (e) {
      log('error', 'Falha ao carregar Raio-X oficial para teste.', { ref, motivo:e.message });
      return htmlError(res, 502, 'Não foi possível abrir o Raio-X', 'O formulário oficial não pôde ser carregado agora.');
    }
  }

  const token = texto(req.query?.token, 120).trim();
  if (!token) return htmlError(res, 400, 'Link de teste inválido', 'O token de teste está ausente.');
  const hash = await sha256Hex(TEST_SALT + token);
  const tokenHash = TEST_TOKEN_HASHES.find((h) => comparacaoSegura(hash, h));
  if (!tokenHash) return htmlError(res, 403, 'Link de teste inválido', 'Este token não foi reconhecido.');

  const newRef = `ym_raiox_${Date.now()}_teste${Math.random().toString(16).slice(2,10)}`;
  const reservou = await store.marcarCodigoResgatado(tokenHash, newRef);
  if (!reservou) return htmlError(res, 403, 'Link já utilizado', 'Este link de teste já foi usado.');

  const now = new Date().toISOString();
  await store.salvar(newRef, {
    ref:newRef,
    status:STATUS.APPROVED,
    paymentId:null,
    customer:'TESTE EXECUÇÃO YM',
    value:0,
    origem:'teste_execucao',
    createdAt:now,
    updatedAt:now,
  });

  log('info', 'Teste do Raio-X com entrega garantida liberado.', { ip, ref:newRef });
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, `${CANONICAL_SELF}?ref=${encodeURIComponent(newRef)}&teste_execucao=1`);
}
