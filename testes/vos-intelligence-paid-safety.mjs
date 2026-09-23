import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const handler=await readFile(new URL('../api/raiox/interpretar.js',import.meta.url),'utf8');
const diagnostic=await readFile(new URL('../lib/vos-intelligence-diagnostic-v1.js',import.meta.url),'utf8');

const lockIndex=handler.indexOf('await store.adquirirTravaGeracao(ref, attemptId)');
const generationIndex=handler.indexOf('await generateVosIntelligenceReport(analysisIntake)',lockIndex);
assert.ok(lockIndex>=0,'a geração paga deve adquirir trava atômica');
assert.ok(generationIndex>lockIndex,'a trava atômica deve vir antes da chamada paga');
assert.match(handler,/RAIOX_PROCESSING/,'requisições concorrentes devem receber um erro explícito');
assert.match(handler,/VOS_PREVIEW_TEST_TOKEN_HASH/,'a sessão paga de preview deve exigir token');
assert.match(handler,/marcarCodigoResgatado\(`vos-preview:/,'o token de preview deve ser de uso único');
assert.match(handler,/review_required/,'falhas com cobrança incerta devem exigir revisão manual');
assert.match(handler,/spent_no_report/,'resposta consumida sem relatório deve bloquear repetição automática');

assert.match(diagnostic,/AbortController/,'a chamada paga deve ter cancelamento por timeout');
assert.match(diagnostic,/OPENAI_VOS_TIMEOUT_MS/,'o timeout deve ser configurável');
assert.match(diagnostic,/\[401,403\]\.includes\(response\.status\)/,'fallback só pode ocorrer em falha de autenticação');
assert.doesNotMatch(diagnostic,/response\.status\s*>=\s*500[^\n]*callRuntime/,'erro 5xx não pode disparar uma segunda cobrança');

console.log('VOS Intelligence paid safety: OK');
