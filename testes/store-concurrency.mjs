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
const lockRef=`generation_lock_${Date.now()}`;
const owners=Array.from({length:20},(_,i)=>`owner_${i}`);
const acquisitions=await Promise.all(owners.map(owner=>store.adquirirTravaGeracao(lockRef,owner,60)));
assert.equal(acquisitions.filter(Boolean).length,1,'somente uma requisição pode adquirir a trava paga');
const owner=owners[acquisitions.findIndex(Boolean)];
assert.equal(await store.liberarTravaGeracao(lockRef,'wrong_owner'),false,'terceiro não pode liberar a trava');
assert.equal(await store.adquirirTravaGeracao(lockRef,'late_owner',60),false,'trava permanece com o proprietário');
assert.equal(await store.liberarTravaGeracao(lockRef,owner),true,'proprietário libera a trava');
assert.equal(await store.adquirirTravaGeracao(lockRef,'next_owner',60),true,'nova geração só entra após liberação');
await store.liberarTravaGeracao(lockRef,'next_owner');
console.log('Store atomic patch concurrency: OK');
