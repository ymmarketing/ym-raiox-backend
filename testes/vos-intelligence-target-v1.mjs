import assert from 'node:assert/strict';
import {selectBenchmark,validateBenchmark} from '../lib/vos-intelligence-benchmark-v1.js';
import {buildTargetTrajectory,calculateTargetConfidence} from '../lib/vos-intelligence-target-v1.js';

const context={segment:'Consultoria',business_model:'B2B',region:'Brasil',channel:'Outbound',average_ticket:2000,sales_model:'Venda consultiva'};
const benchmarks=[{
  id:'BM_LEAD_CLIENT_001',kpi:'lead_to_customer_pct',unit:'percentage_point',low:7,high:9,
  segment:'Consultoria',business_model:'B2B',region:'Brasil',channel:'Outbound',sales_model:'Venda consultiva',ticket_low:1000,ticket_high:5000,
  source:{title:'Estudo comparável',url:'https://example.com/study',published_at:'2026-01-15',sample_size:1200,type:'research',methodology:'Coorte de empresas de serviços'},
}];

assert.equal(validateBenchmark(benchmarks[0],new Date('2026-09-22')).valid,true);
const selection=selectBenchmark(benchmarks,context,'lead_to_customer_pct',new Date('2026-09-22'));
assert.equal(selection.status,'BENCHMARK_SELECTED');
assert.equal(selection.selected.comparability.score,100);
assert.equal(selection.selected.reliability.level,'alta');

const dq={grade:'A'};
const target=buildTargetTrajectory({
  kpi:'lead_to_customer_pct',baseline:5,unit:'percentage_point',data_quality:dq,benchmark_selection:selection,
  impact_estimate:{low:2,high:3,source:'BM_LEAD_CLIENT_001',basis:'Faixa observada para a intervenção comparável.'},
  assumptions:['Execução mínima de 90% do plano.'],
});
assert.equal(target.status,'TARGET_TRAJECTORY_READY');
assert.deepEqual(target.target_30d,{low:5.7,high:6.05});
assert.deepEqual(target.target_60d,{low:6.4,high:7.1});
assert.deepEqual(target.target_90d,{low:7,high:8});
assert.equal(target.confidence.level,'alta');

const blocked=buildTargetTrajectory({kpi:'revenue',baseline:10000,data_quality:{grade:'C'}});
assert.equal(blocked.status,'TARGET_BLOCKED');
assert.ok(blocked.blockers.includes('data_quality'));

const customersBenchmark={...benchmarks[0],id:'BM_CUSTOMERS',kpi:'customers',low:10,high:20};
const customerSelection=selectBenchmark([customersBenchmark],context,'customers',new Date('2026-09-22'));
const capacityTarget=buildTargetTrajectory({
  kpi:'customers',baseline:5,unit:'absolute',data_quality:dq,benchmark_selection:customerSelection,
  impact_estimate:{low:8,high:15,source:'BM_CUSTOMERS',basis:'Cenário comparável.'},capacity_monthly:12,
});
assert.deepEqual(capacityTarget.target_90d,{low:12,high:12});
assert.equal(capacityTarget.capacity_guard.limited,true);

const confidence=calculateTargetConfidence({data_quality_grade:'B',benchmark:selection.selected,impact_estimate:{source:'x',basis:'y'}});
assert.equal(confidence.level,'media');

console.log('VOS Intelligence benchmark + target: OK');

