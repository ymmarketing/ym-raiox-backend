import assert from 'node:assert/strict';
import {buildDeclaredIntake,buildDeclaredMetricPeriod,VOS_DECLARED_METRICS} from '../lib/vos-intelligence-intake-v1.js';

const raw={
  company:{segment:'Consultoria',business_model:'B2B',region:'Brasil',channels:['Indicação'],goal_horizon_days:90},
  metrics:{metric_period:'2026-08-01/2026-08-31',revenue:'10000',gross_margin_pct:'60',acquisition_spend:'0'},
  metric_unknown:Object.fromEntries(VOS_DECLARED_METRICS.map(key=>[key,!['revenue','gross_margin_pct','acquisition_spend'].includes(key)])),
};
const intake=buildDeclaredIntake(raw);
assert.equal(intake.validation.valid,true);
assert.equal(intake.metrics.revenue,10000);
assert.equal(intake.metrics.acquisition_spend,0);
assert.equal(intake.metrics.leads,null);
assert.equal(intake.metric_unknown.leads,true);

const implicitGap=buildDeclaredIntake({company:raw.company,metrics:{metric_period:'2026-08-01/2026-08-31'},metric_unknown:{}});
assert.equal(implicitGap.validation.valid,false);
assert.ok(implicitGap.validation.errors.includes('missing_or_invalid:revenue'));

const invalidPeriod=buildDeclaredIntake({...raw,metrics:{...raw.metrics,metric_period:'2026-09-01/2026-08-01'}});
assert.ok(invalidPeriod.validation.errors.includes('invalid:metric_period_order'));
assert.equal(buildDeclaredMetricPeriod('2026-03-10','2026-09-21'),'2026-03-10/2026-09-21');
assert.equal(buildDeclaredMetricPeriod('2026-03-10',''),'');

console.log('VOS Intelligence declared intake: OK');
