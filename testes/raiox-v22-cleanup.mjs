import assert from 'node:assert/strict';

process.env.OPENAI_API_KEY = 'sk-ficticia-limpeza';
process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis-cleanup.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'ficticio';

const redis = new Map();
let failFirstDelete = true;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('fake-redis-cleanup.test')) {
    const [command, key, value] = JSON.parse(options.body);
    if (command === 'GET') return Response.json({ result: redis.get(key) || null });
    if (command === 'SET') { redis.set(key, value); return Response.json({ result: 'OK' }); }
    throw new Error('Comando Redis inesperado: ' + command);
  }
  if (String(url).includes('/v1/files/file_teste')) {
    const status = failFirstDelete ? 500 : 200;
    return new Response('', { status });
  }
  throw new Error('Fetch inesperado: ' + url);
};

const { store, STATUS } = await import('../lib/store.js');
const { cleanupV2Uploads } = await import('../api/raiox/interpretar.js');
const ref = 'ym_raiox_20260929_teste12345678';
const uploads = [{ file_id: 'file_teste', name: 'material.png' }];
await store.salvar(ref, { ref, status: STATUS.APPROVED, raioxV2Uploads: uploads, raioxV2Report: { summary: {} } });

await cleanupV2Uploads(ref, uploads);
let session = await store.buscar(ref);
assert.equal(session.raioxV2FilesCleanupStatus, 'pending_retry');
assert.deepEqual(session.raioxV2Uploads, uploads);
assert.equal(session.raioxV2FilesDeletedAt, null);
assert.ok(session.raioxV2Report);

failFirstDelete = false;
await cleanupV2Uploads(ref, session.raioxV2Uploads);
session = await store.buscar(ref);
assert.equal(session.raioxV2FilesCleanupStatus, 'completed');
assert.deepEqual(session.raioxV2Uploads, []);
assert.ok(session.raioxV2FilesDeletedAt);
assert.ok(session.raioxV2Report);
console.log('Raio-X V2.2: falha de exclusão preserva relatório e permite nova tentativa.');
