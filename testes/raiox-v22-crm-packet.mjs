import assert from 'node:assert/strict';
import { buildRaioxV22CrmPacket } from '../lib/raiox-crm-sync.js';

const packet = buildRaioxV22CrmPacket({
  ref: 'ym_raiox_teste_12345678',
  intake: {
    business_name: 'Empresa Teste',
    contact_name: 'Pessoa Responsável',
    contact_email: 'pessoa@example.com',
    contact_whatsapp: '31999999999',
    answers: { Q01: 'Resposta' },
  },
  report: { score_panel: { overall_score: 7.5, indicators: [] } },
  session: { customerName: 'Pagador diferente', customerEmail: 'pagador@example.com' },
});

assert.equal(packet.source_product, 'RAIO_X_DIGITAL');
assert.equal(packet.payer.name, 'Pessoa Responsável');
assert.equal(packet.payer.email, 'pessoa@example.com');
assert.equal(packet.payer.phone, '31999999999');
assert.equal(packet.score.overall, 7.5);
assert.equal(packet.source_session_id, 'ym_raiox_teste_12345678');
console.log('Raio-X Digital → CRM: packet e contato preservados.');
