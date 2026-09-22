import assert from 'node:assert/strict';
import {store} from '../lib/store.js';

const ref=`store_concurrency_${Date.now()}`;
await store.salvar(ref,{ref,status:'approved',createdAt:new Date().toISOString(),base:true});

await Promise.all(Array.from({length:20},(_,i)=>store.atualizar(ref,{[`field_${i}`]:i})));
const result=await store.buscar(ref);

assert.equal(result.base,true);
for(let i=0;i<20;i++) assert.equal(result[`field_${i}`],i);
assert.equal(result.status,'approved');
const imageId='img_test';
await store.salvarImagem(ref,imageId,'data:image/jpeg;base64,ZmFrZQ==');
assert.equal(await store.buscarImagem(ref,imageId),'data:image/jpeg;base64,ZmFrZQ==');
await store.removerImagem(ref,imageId);
assert.equal(await store.buscarImagem(ref,imageId),null);
console.log('Store atomic patch concurrency: OK');
