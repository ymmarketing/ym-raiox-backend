import assert from 'node:assert/strict';
import {actionLibraryCoverage,buildContentWeek,buildPlaybook,validateExecutableMicroAction} from '../lib/vos-intelligence-playbook-v1.js';

assert.equal(actionLibraryCoverage().every(item=>item.executable),true);

const playbook=buildPlaybook({
  pillar:'Operação',ps:['Pessoas','Processos','Performance'],signals:['followup_baixo','tempo_resposta_alto'],
  owners:{ACT_FOLLOWUP_001:'Yasmin'},
  targets:{lead_to_customer_pct:{status:'TARGET_TRAJECTORY_READY',target_30d:{low:5.5,high:6}}},
});
assert.equal(playbook.status,'PLAYBOOK_READY');
assert.ok(playbook.selected_action_ids.includes('ACT_FOLLOWUP_001'));
assert.equal(playbook.micro_actions.every(item=>validateExecutableMicroAction(item).valid),true);
assert.ok(playbook.routine.today.length>0);
assert.ok(playbook.routine.this_week.some(item=>item.slot.includes('08h30')));

const content=buildContentWeek({
  offer:'Raio-X Estratégico',audience:'pequenos negócios de serviços',problem:'marketing sem prioridade clara',
  proof:'o diagnóstico reorganizou as prioridades antes de um novo investimento',objection:'Já tentei marketing e não funcionou',cta:'Envie “RAIO-X” no WhatsApp.',
});
assert.equal(content.status,'CONTENT_WEEK_READY');
assert.equal(content.items.length,5);
assert.equal(content.items.every(item=>item.title&&item.cover&&item.structure.length&&item.caption&&item.cta&&item.kpi),true);

const incomplete=buildContentWeek({offer:'Raio-X'});
assert.equal(incomplete.status,'NEEDS_CONTENT_CONTEXT');
assert.ok(incomplete.missing.includes('audience'));

console.log('VOS Intelligence playbook + routine + content: OK');

