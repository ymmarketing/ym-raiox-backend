import assert from 'node:assert/strict';
import {P8} from '../lib/vos-intelligence-v1.js';
import {RX_TO_VOS, coverageByP8, missingNumericData} from '../lib/vos-intelligence-mapping-v1.js';

assert.deepEqual(P8,['Produto','Preço','Praça','Promoção','Pessoas','Processos','Posicionamento','Performance']);
assert.deepEqual(RX_TO_VOS.RX23.ps,['Performance']);

const c=coverageByP8({RX07:'x',RX11:'x',RX23:'x'});
assert.ok(c.Produto.coverage_pct>0);
assert.ok(c.Performance.coverage_pct>0);

const missing=missingNumericData({REVENUE:10000,CUSTOMERS:5,ACQUISITION_SPEND:0});
assert.equal(missing.some(x=>x.id==='AVERAGE_TICKET'),false);
assert.equal(missing.some(x=>x.id==='LEADS'),true);
assert.equal(missing.some(x=>x.id==='ACQUISITION_SPEND'),false);

console.log('VOS Intelligence mapping: OK');
