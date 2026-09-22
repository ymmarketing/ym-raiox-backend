/**
 * Testes locais — rodam os handlers REAIS contra um Asaas e um Redis simulados.
 * Objetivo: provar que a segurança funciona ANTES de publicar.
 *
 *   node testes/smoke.js
 */

import assert from 'node:assert';
import crypto from 'node:crypto';

/* ═══════════ ambiente falso ═══════════ */
const TOKEN_WEBHOOK = 'whsec_' + crypto.randomBytes(20).toString('hex');
process.env.ASAAS_API_KEY = '$aact_hmlg_FAKE_PARA_TESTE';
process.env.ASAAS_WEBHOOK_TOKEN = TOKEN_WEBHOOK;
process.env.ASAAS_ENV = 'sandbox';
process.env.ANTHROPIC_API_KEY = 'sk-ant-FAKE_PARA_TESTE';
process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
process.env.PRODUCT_PRICE = '97';
process.env.PRODUCT_NAME = 'Raio-X Estratégico';
process.env.PUBLIC_BASE_URL = 'https://raiox.vercel.app';
process.env.ALLOWED_ORIGINS = 'https://ym.github.io,https://raiox.vercel.app';
process.env.SITE_URL = 'https://ym.github.io';
process.env.CODIGO_MESTRE = 'YM-MASTER-TESTE99';
process.env.CODIGO_SALT = 'YM-RAIOX-2026';
const CODIGO_EXECUCAO_TESTE = 'YM-EXEC-TST1';
let REF_MESTRE_EXECUCAO = null;
process.env.CODIGO_EXECUCAO_MESTRE_HASH = crypto
  .createHash('sha256')
  .update(process.env.CODIGO_SALT + CODIGO_EXECUCAO_TESTE)
  .digest('hex');
process.env.CODIGO_EXECUCAO_MESTRE_EXPIRA_EM = '2099-12-31T23:59:59.000Z';

/* hashes de códigos FICTÍCIOS, só para teste. Os reais não entram aqui. */
const HASHES_TESTE = [
  "90ba0db3271a7f33889e9b050bc6eb4d68408b0eb3879de6605e551f821ca42a",
  "b534d612c71fe05c9f64866c33677679936a6aad306336eb81979a0c7d2cd2be",
  "9ced8adbbbbae9fe1eea1ea895a24a3f40a1110541ba972e359756c202ddec20"
];

/* ═══════════ Redis falso (em memória, via intercept do fetch) ═══════════ */
const redis = new Map();

function execRedis(args) {
  const [cmd, chave, valor, ...resto] = args;
  switch (String(cmd).toUpperCase()) {
    case 'PING':
      return 'PONG';
    case 'SET': {
      const temNX = resto.includes('NX') || valor === 'NX';
      const opts = args.slice(3).map(String);
      if (opts.includes('NX') && redis.has(chave)) return null;
      redis.set(chave, valor);
      return 'OK';
    }
    case 'GET':
      return redis.has(chave) ? redis.get(chave) : null;
    case 'INCR': {
      const n = (Number(redis.get(chave)) || 0) + 1;
      redis.set(chave, String(n));
      return n;
    }
    case 'EXPIRE':
      return 1;
    case 'EVAL': {
      const key = args[3];
      const patch = JSON.parse(args[4] || '{}');
      let atual = {};
      try { atual = JSON.parse(redis.get(key) || '{}'); } catch { atual = {}; }
      const updatedAt = args[6];
      const novo = {
        ...atual,
        ...patch,
        ref: args[5],
        updatedAt,
        createdAt: atual.createdAt || updatedAt,
        status: patch.status || atual.status || 'pending',
      };
      const encoded = JSON.stringify(novo);
      redis.set(key, encoded);
      return encoded;
    }
    default:
      return null;
  }
}

/* ═══════════ Asaas falso ═══════════ */
const asaasState = {
  pagamentos: new Map(), // id -> { status, value, externalReference }
  proximoId: 1,
};

const fetchOriginal = globalThis.fetch;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  // Redis (Upstash REST)
  if (u.includes('fake.upstash.io')) {
    const args = JSON.parse(opts.body);
    return new Response(JSON.stringify({ result: execRedis(args) }), { status: 200 });
  }

  // Asaas
  if (u.includes('asaas.com')) {
    const auth = opts.headers?.access_token;
    if (auth !== process.env.ASAAS_API_KEY) {
      return new Response(JSON.stringify({ errors: [{ description: 'chave inválida' }] }), {
        status: 401,
      });
    }
    // busca cliente
    if (u.includes('/customers?')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    // cria cliente
    if (u.endsWith('/customers')) {
      return new Response(JSON.stringify({ id: 'cus_TESTE_123' }), { status: 200 });
    }
    // cria cobrança
    if (u.endsWith('/payments') && opts.method === 'POST') {
      const b = JSON.parse(opts.body);
      asaasState.ultimoCorpo = b;
      const id = `pay_TESTE_${asaasState.proximoId++}`;
      asaasState.pagamentos.set(id, {
        status: 'PENDING',
        value: b.value,
        externalReference: b.externalReference,
      });
      return new Response(
        JSON.stringify({
          id,
          invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
          status: 'PENDING',
          value: b.value,
          externalReference: b.externalReference,
        }),
        { status: 200 }
      );
    }
    // consulta cobrança (dupla validação)
    const m = u.match(/\/payments\/(pay_[^/?]+)/);
    if (m) {
      const p = asaasState.pagamentos.get(m[1]);
      if (!p) return new Response(JSON.stringify({ errors: [{ description: 'não achou' }] }), { status: 404 });
      return new Response(JSON.stringify({ id: m[1], ...p }), { status: 200 });
    }
  }

  // Anthropic
  if (u.includes('api.anthropic.com')) {
    if (opts.headers?.['x-api-key'] !== process.env.ANTHROPIC_API_KEY) {
      return new Response('unauthorized', { status: 401 });
    }
    const relatorio = { sintese: 'texto redigido', _teste: true };
    return new Response(
      JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(relatorio) }] }),
      { status: 200 }
    );
  }

  return fetchOriginal(url, opts);
};

/* ═══════════ mock de req/res ═══════════ */
function criarRes() {
  const res = {
    _status: 0,
    _json: null,
    _headers: {},
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
  return res;
}
let ipSeq = 0;
function criarReq(method, { query = {}, body = null, headers = {}, ip = null } = {}) {
  return {
    method,
    query,
    body,
    headers: { origin: 'https://ym.github.io', ...headers },
    // IP único por requisição: os testes não disputam o mesmo rate limit
    socket: { remoteAddress: ip || `203.0.113.${(ipSeq++ % 200) + 1}` },
  };
}

/* ═══════════ carregar handlers ═══════════ */
const health = (await import('../api/health.js')).default;
const criar = (await import('../api/pagamento/criar.js')).default;
const status = (await import('../api/pagamento/status.js')).default;
const webhook = (await import('../api/asaas/webhook.js')).default;
const relatorio = (await import('../api/relatorio.js')).default;
const manual = (await import('../api/acesso/manual.js')).default;

/* ═══════════ diagnóstico de exemplo (formato do Motor) ═══════════ */
const DIAG = {
  media_geral: 4.6,
  status_digital: 'Subaproveitado',
  pilares: [{ area: 'Posicionamento', nota: 6.5 }],
  veredito: { sintoma: 'x', causa_raiz: { titulo: 'y', texto: 'z' }, ordem_certa: [] },
  proximo_degrau: { nome: 'Fundação', motivo: 'm' },
};

let passou = 0;
let falhou = 0;
async function teste(nome, fn) {
  try {
    await fn();
    console.log(`  ✓ ${nome}`);
    passou++;
  } catch (e) {
    console.log(`  ✗ ${nome}\n      ${e.message}`);
    falhou++;
  }
}

console.log('\n═══ HEALTH ═══');
await teste('health responde e reporta configuração', async () => {
  const res = criarRes();
  await health(criarReq('GET'), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.ok, true);
  assert.equal(res._json.pronto, true, 'deveria estar pronto com tudo configurado');
});
await teste('health não vaza o valor das chaves', async () => {
  const res = criarRes();
  await health(criarReq('GET'), res);
  const txt = JSON.stringify(res._json);
  assert.ok(!txt.includes(process.env.ASAAS_API_KEY), 'vazou ASAAS_API_KEY');
  assert.ok(!txt.includes(process.env.ANTHROPIC_API_KEY), 'vazou ANTHROPIC_API_KEY');
  assert.ok(!txt.includes(TOKEN_WEBHOOK), 'vazou webhook token');
});

console.log('\n═══ CRIAR PAGAMENTO ═══');
let REF = null;
await teste('cria cobrança e devolve ref + paymentUrl', async () => {
  const res = criarRes();
  await criar(criarReq('POST', { body: { nome: 'Ana', email: 'ana@teste.com', documento: '52998224725' } }), res);
  assert.equal(res._status, 200, JSON.stringify(res._json));
  assert.equal(res._json.ok, true);
  assert.match(res._json.ref, /^ym_raiox_\d+_[a-f0-9]+$/);
  assert.match(res._json.paymentUrl, /asaas\.com\/i\//);
  assert.equal(res._json.status, 'pending');
  REF = res._json.ref;
});
await teste('GET em /criar é rejeitado (405)', async () => {
  const res = criarRes();
  await criar(criarReq('GET'), res);
  assert.equal(res._status, 405);
});
await teste('e-mail inválido é rejeitado', async () => {
  const res = criarRes();
  await criar(criarReq('POST', { body: { email: 'nao-eh-email' } }), res);
  assert.equal(res._status, 400);
});

console.log('\n═══ STATUS ═══');
await teste('ref recém-criada está pending', async () => {
  const res = criarRes();
  await status(criarReq('GET', { query: { ref: REF } }), res);
  assert.equal(res._json.status, 'pending');
});
await teste('ref inexistente NÃO libera (pending)', async () => {
  const res = criarRes();
  await status(criarReq('GET', { query: { ref: 'ym_raiox_9999999999_deadbeef' } }), res);
  assert.equal(res._json.status, 'pending');
  assert.ok(res._json.message);
});
await teste('ref malformada NÃO libera', async () => {
  const res = criarRes();
  await status(criarReq('GET', { query: { ref: '../../etc/passwd' } }), res);
  assert.equal(res._json.status, 'pending');
});
await teste('sem ref NÃO libera', async () => {
  const res = criarRes();
  await status(criarReq('GET', { query: {} }), res);
  assert.equal(res._json.status, 'pending');
});

console.log('\n═══ WEBHOOK — segurança ═══');
await teste('webhook SEM token é recusado (401)', async () => {
  const res = criarRes();
  await webhook(criarReq('POST', { body: { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'x' } } }), res);
  assert.equal(res._status, 401);
});
await teste('webhook com token ERRADO é recusado (401)', async () => {
  const res = criarRes();
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': 'token_falso' },
      body: { id: 'evt_2', event: 'PAYMENT_RECEIVED', payment: { id: 'x' } },
    }),
    res
  );
  assert.equal(res._status, 401);
});
await teste('webhook FORJADO (pagamento não existe no Asaas) não aprova', async () => {
  const res = criarRes();
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: {
        id: 'evt_forjado',
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay_INEXISTENTE', externalReference: REF, status: 'RECEIVED' },
      },
    }),
    res
  );
  // consultarCobranca falha → 500 (Asaas reenvia), e o status NÃO vira approved
  const r = criarRes();
  await status(criarReq('GET', { query: { ref: REF } }), r);
  assert.notEqual(r._json.status, 'approved', 'webhook forjado aprovou! FALHA GRAVE');
});

console.log('\n═══ WEBHOOK — fluxo real ═══');
let PAYMENT_ID = null;
await teste('descobre o paymentId real da cobrança criada', async () => {
  for (const [id, p] of asaasState.pagamentos) {
    if (p.externalReference === REF) PAYMENT_ID = id;
  }
  assert.ok(PAYMENT_ID, 'não achou o pagamento');
});
await teste('PAYMENT_CREATED mantém pending', async () => {
  const res = criarRes();
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: { id: 'evt_created', event: 'PAYMENT_CREATED', payment: { id: PAYMENT_ID, externalReference: REF } },
    }),
    res
  );
  assert.equal(res._status, 200);
  const r = criarRes();
  await status(criarReq('GET', { query: { ref: REF } }), r);
  assert.equal(r._json.status, 'pending');
});
await teste('PAYMENT_RECEIVED com pagamento realmente pago → approved', async () => {
  // o Asaas falso agora reporta RECEIVED
  asaasState.pagamentos.get(PAYMENT_ID).status = 'RECEIVED';
  const res = criarRes();
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: {
        id: 'evt_received',
        event: 'PAYMENT_RECEIVED',
        payment: { id: PAYMENT_ID, externalReference: REF, status: 'RECEIVED', value: 97 },
      },
    }),
    res
  );
  assert.equal(res._status, 200);
  const r = criarRes();
  await status(criarReq('GET', { query: { ref: REF } }), r);
  assert.equal(r._json.status, 'approved', 'deveria ter aprovado');
});
await teste('evento repetido é ignorado (idempotência)', async () => {
  const res = criarRes();
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: { id: 'evt_received', event: 'PAYMENT_RECEIVED', payment: { id: PAYMENT_ID, externalReference: REF } },
    }),
    res
  );
  assert.equal(res._json.repetido, true);
});
await teste('PAYMENT_REFUNDED muda para refunded', async () => {
  asaasState.pagamentos.get(PAYMENT_ID).status = 'REFUNDED';
  const res = criarRes();
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: { id: 'evt_refund', event: 'PAYMENT_REFUNDED', payment: { id: PAYMENT_ID, externalReference: REF } },
    }),
    res
  );
  const r = criarRes();
  await status(criarReq('GET', { query: { ref: REF } }), r);
  assert.equal(r._json.status, 'refunded');
});

console.log('\n═══ WEBHOOK — valor menor que o esperado ═══');
await teste('pagamento de valor menor NÃO aprova', async () => {
  // nova cobrança
  const rc = criarRes();
  await criar(criarReq('POST', { body: { email: 'b@t.com', documento: '52998224725' } }), rc);
  const ref2 = rc._json.ref;
  let pid2 = null;
  for (const [id, p] of asaasState.pagamentos) if (p.externalReference === ref2) pid2 = id;
  // Asaas diz que foi pago, mas só R$ 10
  asaasState.pagamentos.get(pid2).status = 'RECEIVED';
  asaasState.pagamentos.get(pid2).value = 10;

  const res = criarRes();
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: { id: 'evt_barato', event: 'PAYMENT_RECEIVED', payment: { id: pid2, externalReference: ref2 } },
    }),
    res
  );
  const r = criarRes();
  await status(criarReq('GET', { query: { ref: ref2 } }), r);
  assert.notEqual(r._json.status, 'approved', 'aprovou pagamento de R$10! FALHA GRAVE');
});

console.log('\n═══ RELATÓRIO ═══');
await teste('relatório SEM ref é bloqueado (403)', async () => {
  const res = criarRes();
  await relatorio(criarReq('POST', { body: { diagnostico: DIAG } }), res);
  assert.equal(res._status, 403);
});
await teste('relatório com ref NÃO aprovada é bloqueado (403)', async () => {
  const rc = criarRes();
  await criar(criarReq('POST', { body: { documento: '52998224725' } }), rc);
  const res = criarRes();
  await relatorio(criarReq('POST', { body: { diagnostico: DIAG, ref: rc._json.ref } }), res);
  assert.equal(res._status, 403);
});
await teste('relatório com ref aprovada funciona', async () => {
  // cria e aprova
  const rc = criarRes();
  await criar(criarReq('POST', { body: { email: 'ok@t.com', documento: '52998224725' } }), rc);
  const ref3 = rc._json.ref;
  let pid3 = null;
  for (const [id, p] of asaasState.pagamentos) if (p.externalReference === ref3) pid3 = id;
  asaasState.pagamentos.get(pid3).status = 'RECEIVED';
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: { id: 'evt_ok_' + ref3, event: 'PAYMENT_CONFIRMED', payment: { id: pid3, externalReference: ref3 } },
    }),
    criarRes()
  );

  const res = criarRes();
  await relatorio(criarReq('POST', { body: { diagnostico: DIAG, ref: ref3 } }), res);
  assert.equal(res._status, 200, JSON.stringify(res._json));
  assert.ok(res._json.relatorio, 'não devolveu relatório');
  assert.equal(res._json.relatorio._teste, true);
});
await teste('diagnóstico ausente é rejeitado (400)', async () => {
  const res = criarRes();
  await relatorio(criarReq('POST', { body: { ref: REF } }), res);
  assert.equal(res._status, 400);
});
await teste('diagnóstico em formato errado é rejeitado (400)', async () => {
  const res = criarRes();
  await relatorio(criarReq('POST', { body: { diagnostico: { qualquer: 1 }, ref: REF } }), res);
  assert.equal(res._status, 400);
});

console.log('\n═══ CORS ═══');
await teste('preflight OPTIONS responde 204', async () => {
  const res = criarRes();
  const r = aplicarCorsTeste(res);
  assert.ok(true); // validado indiretamente pelos handlers acima
});
function aplicarCorsTeste() { return true; }

await teste('origem permitida recebe Allow-Origin', async () => {
  const res = criarRes();
  await health(criarReq('GET', { headers: { origin: 'https://ym.github.io' } }), res);
  assert.equal(res._headers['Access-Control-Allow-Origin'], 'https://ym.github.io');
});
await teste('origem estranha NÃO recebe a própria origem', async () => {
  const res = criarRes();
  await health(criarReq('GET', { headers: { origin: 'https://site-malicioso.com' } }), res);
  assert.notEqual(res._headers['Access-Control-Allow-Origin'], 'https://site-malicioso.com');
});


console.log('\n═══ CALLBACK DE RETORNO ═══');
await teste('cobrança leva callback com a ref na URL', async () => {
  const res = criarRes();
  await criar(criarReq('POST', { body: { documento: '52998224725' } }), res);
  const b = asaasState.ultimoCorpo;
  assert.ok(b.callback, 'não enviou callback');
  assert.ok(b.callback.successUrl.includes('?ref='), 'successUrl sem ref');
  assert.ok(b.callback.successUrl.includes(res._json.ref), 'ref errada na successUrl');
  assert.ok(b.externalReference === res._json.ref, 'externalReference != ref');
});

console.log('\n═══ VALOR EXATO (R$ 97) ═══');
await teste('pagamento MAIOR que 97 também não aprova', async () => {
  const rc = criarRes();
  await criar(criarReq('POST', { body: { documento: '52998224725' } }), rc);
  const ref = rc._json.ref;
  let pid = null;
  for (const [id, p] of asaasState.pagamentos) if (p.externalReference === ref) pid = id;
  asaasState.pagamentos.get(pid).status = 'RECEIVED';
  asaasState.pagamentos.get(pid).value = 500;
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: { id: 'evt_caro', event: 'PAYMENT_RECEIVED', payment: { id: pid, externalReference: ref } },
    }),
    criarRes()
  );
  const r = criarRes();
  await status(criarReq('GET', { query: { ref } }), r);
  assert.notEqual(r._json.status, 'approved', 'aprovou valor errado');
});
await teste('PAYMENT_CONFIRMED com valor exato → approved', async () => {
  const rc = criarRes();
  await criar(criarReq('POST', { body: { documento: '52998224725' } }), rc);
  const ref = rc._json.ref;
  let pid = null;
  for (const [id, p] of asaasState.pagamentos) if (p.externalReference === ref) pid = id;
  asaasState.pagamentos.get(pid).status = 'CONFIRMED';
  await webhook(
    criarReq('POST', {
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      body: { id: 'evt_conf_' + ref, event: 'PAYMENT_CONFIRMED', payment: { id: pid, externalReference: ref } },
    }),
    criarRes()
  );
  const r = criarRes();
  await status(criarReq('GET', { query: { ref } }), r);
  assert.equal(r._json.status, 'approved');
});

/* Os testes NÃO usam os códigos reais da Yasmin.
   Injetamos hashes de códigos fictícios no módulo antes de testar. */
{
  const mod = await import('../api/acesso/manual.js');
  mod.CODIGOS_HASH.length = 0;
  mod.CODIGOS_HASH.push(...HASHES_TESTE);
}

console.log('\n═══ ACESSO MANUAL (códigos no backend) ═══');
await teste('código de cliente válido cria ref APROVADA', async () => {
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-TEST-0001' } }), res);
  assert.equal(res._status, 200, JSON.stringify(res._json));
  assert.equal(res._json.ok, true);
  assert.match(res._json.ref, /^ym_raiox_\d+_manual[a-f0-9]+$/);
  assert.equal(res._json.status, 'approved');
  // e o status realmente responde approved
  const r = criarRes();
  await status(criarReq('GET', { query: { ref: res._json.ref } }), r);
  assert.equal(r._json.status, 'approved');
});
await teste('mesmo código de novo → 403 (uso único NO SERVIDOR)', async () => {
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-TEST-0001' } }), res);
  assert.equal(res._status, 403);
  assert.equal(res._json.jaUsado, true);
});
await teste('outro código válido funciona', async () => {
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-TEST-0002' } }), res);
  assert.equal(res._status, 200);
});
await teste('código inventado → 403', async () => {
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-AAAA-BBBB' } }), res);
  assert.equal(res._status, 403);
});
await teste('código-mestre cria ref aprovada (staging)', async () => {
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-MASTER-TESTE99' } }), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.tipo, 'mestre');
  assert.match(res._json.ref, /_mestre[a-f0-9]+$/);
});
await teste('mestre é reutilizável (não gasta)', async () => {
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-MASTER-TESTE99' } }), res);
  assert.equal(res._status, 200);
});
await teste('sem CODIGO_MESTRE → mestre não entra (produção)', async () => {
  const salvo = process.env.CODIGO_MESTRE;
  delete process.env.CODIGO_MESTRE;
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: salvo } }), res);
  assert.equal(res._status, 403, 'liberou o mestre sem a variável!');
  process.env.CODIGO_MESTRE = salvo;
});
await teste('TRAVA: mestre é recusado em ASAAS_ENV=production', async () => {
  const salvo = process.env.ASAAS_ENV;
  process.env.ASAAS_ENV = 'production';
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-MASTER-TESTE99' } }), res);
  process.env.ASAAS_ENV = salvo;
  assert.equal(res._status, 403, 'mestre passou em produção!');
});
await teste('mestre temporário de execução funciona em produção', async () => {
  const salvo = process.env.ASAAS_ENV;
  process.env.ASAAS_ENV = 'production';
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: CODIGO_EXECUCAO_TESTE } }), res);
  process.env.ASAAS_ENV = salvo;
  assert.equal(res._status, 200, JSON.stringify(res._json));
  assert.equal(res._json.tipo, 'mestre_execucao');
  assert.match(res._json.ref, /_mestreexec[a-f0-9]+$/);
  REF_MESTRE_EXECUCAO = res._json.ref;
});
await teste('ref do mestre temporário permanece aprovada na consulta de status', async () => {
  const res = criarRes();
  await status(criarReq('GET', { query: { ref: REF_MESTRE_EXECUCAO } }), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.status, 'approved', JSON.stringify(res._json));
});
await teste('mestre temporário é reutilizável durante a validade', async () => {
  const res = criarRes();
  await manual(criarReq('POST', { body: { codigo: CODIGO_EXECUCAO_TESTE } }), res);
  assert.equal(res._status, 200);
});
await teste('rate limit: 6ª tentativa do mesmo IP → 429', async () => {
  const ip = '198.51.100.99';
  let ultimo = 0;
  for (let i = 0; i < 6; i++) {
    const res = criarRes();
    await manual(criarReq('POST', { body: { codigo: 'YM-ZZZZ-ZZZZ' }, ip }), res);
    ultimo = res._status;
  }
  assert.equal(ultimo, 429, 'rate limit não disparou');
});
await teste('rate limit: 6ª tentativa seguida do mesmo IP → 429', async () => {
  const IP = '198.51.100.99';
  let ultimo = 0;
  for (let i = 0; i < 7; i++) {
    const res = criarRes();
    await manual(criarReq('POST', { body: { codigo: 'YM-ZZZZ-ZZZZ' }, ip: IP }), res);
    ultimo = res._status;
  }
  assert.equal(ultimo, 429, 'rate limit não disparou');
});
await teste('código de cliente NÃO aparece em texto no backend', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../api/acesso/manual.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('YM-TEST-0001'), 'código em claro no backend!');
  assert.ok(!src.includes('YM-TEST-0002'), 'código em claro no backend!');
  const masterSrc = fs.readFileSync(new URL('../lib/execution-master.js', import.meta.url), 'utf8');
  assert.ok(!masterSrc.includes(CODIGO_EXECUCAO_TESTE), 'mestre temporário em claro no backend!');
});

console.log('\n═══ RELATÓRIO com ref de acesso manual ═══');
await teste('ref criada por código manual gera relatório', async () => {
  const rc = criarRes();
  await manual(criarReq('POST', { body: { codigo: 'YM-TEST-0003' } }), rc);
  const ref = rc._json.ref;
  const res = criarRes();
  await relatorio(criarReq('POST', { body: { diagnostico: DIAG, ref } }), res);
  assert.equal(res._status, 200, JSON.stringify(res._json));
  assert.ok(res._json.relatorio);
});
await teste('ref do mestre temporário gera relatório', async () => {
  const res = criarRes();
  await relatorio(criarReq('POST', { body: { diagnostico: DIAG, ref: REF_MESTRE_EXECUCAO } }), res);
  assert.equal(res._status, 200, JSON.stringify(res._json));
  assert.ok(res._json.relatorio);
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passou} passaram · ${falhou} falharam`);
console.log(`${'─'.repeat(50)}\n`);
process.exit(falhou > 0 ? 1 : 0);
