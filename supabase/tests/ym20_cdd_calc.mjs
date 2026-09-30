import assert from 'node:assert/strict';
import {calculateCdd} from '../functions/_shared/cdd-calc.js';

const {results}=calculateCdd({revenue:40000,leads:80,customers:8,ticket:2000,extra_sales:2,marketing_spend:1500,reduction_pct:20,tasks:[{name:'Cadastro',kind:'MANUAL',weekly_count:10,minutes:6,hour_cost:20},{name:'Correção',kind:'REWORK',weekly_count:3,minutes:20,hour_cost:20}]});
assert.equal(results.revenue_before,40000);
assert.equal(results.extra_revenue_scenario,4000);
assert.equal(results.revenue_after_scenario,44000);
assert.equal(results.known_operational_cost,160);
assert.equal(results.potential_cost_reduction,32);
assert.equal(results.marketing_spend_separate,1500);
assert.equal(results.conversion_rate,10);
const missing=calculateCdd({revenue:40000,marketing_spend:1500}).results;
assert.equal(missing.revenue_after_scenario,null);
assert.equal(missing.known_operational_cost,null);
assert.equal(missing.potential_cost_reduction,null);
assert(missing.gaps.includes('novos contatos'));
assert.throws(()=>calculateCdd({leads:4,customers:5}),/customers_above_leads/);
assert.throws(()=>calculateCdd({reduction_pct:120}),/invalid_number/);
console.log('CDD consultivo: cenário, separação econômica, lacunas e limites verificados.');
