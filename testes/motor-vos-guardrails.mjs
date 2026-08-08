import fs from 'node:fs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const migration = fs.readFileSync('supabase/migrations/20260808120304_create_motor_vos_core_v1.sql', 'utf8');
const hardening = fs.readFileSync('supabase/migrations/20260808120621_harden_motor_vos_core_v1.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/create-vos-case/index.ts', 'utf8');
const verActions = fs.readFileSync('supabase/functions/motor-ver-actions/index.ts', 'utf8');
const orderPrep = fs.readFileSync('supabase/functions/motor-order-prep/index.ts', 'utf8');
const motorUi = fs.readFileSync('motor-vos.html', 'utf8');
const architecture = fs.readFileSync('docs/ETAPA4_ARQUITETURA_MOTOR_WEB_VOS_V1.md', 'utf8');

const requiredTables = [
  'vos_cases','vos_p8_coverage','vos_rx_import_signals','vos_evidence','vos_ver_entries',
  'vos_entry_evidence','vos_hypotheses','vos_hypothesis_tests','vos_test_evidence',
  'vos_conclusions','vos_validations','vos_gates','vos_order_candidates'
];
for (const table of requiredTables) {
  assert(migration.includes(`public.${table}`), `Tabela ausente no contrato: ${table}`);
}

for (const p of ['PRODUTO','PRECO','PRACA','PROMOCAO','PESSOAS','PROCESSOS','EVIDENCIAS_FISICAS','PRODUTIVIDADE_QUALIDADE']) {
  assert(migration.includes(`'${p}'`), `8P ausente: ${p}`);
}

for (const f of [
  'PEDIDO_INICIAL','RESULTADO_ESPERADO','FORMULACAO_PROBLEMA','SINTOMA','EVIDENCIA','CONTEXTO',
  'PATRIMONIO_IDENTIFICADO','FATOR_CONTRIBUINTE','HIPOTESE_CAUSAL','CAUSA','RISCO','RESTRICAO',
  'PONTO_CONTROLE','INCERTEZA','VALIDACAO_ESPECIALIZADA'
]) {
  assert(migration.includes(`'${f}'`), `Campo VER ausente: ${f}`);
}

assert(migration.includes("source_packet_version text not null check (source_packet_version = 'VOS_INTAKE_1.0')"), 'VOS_INTAKE_1.0 não está travado');
assert(migration.includes('Fonte VOS Intake do caso é imutável'), 'Snapshot do Intake não está protegido');
assert(migration.includes("human_status text not null default 'PENDENTE'"), 'Validação humana pendente não está explícita');
assert(migration.includes('Hipótese não pode virar validada sem teste registrado'), 'Hipótese sem teste não está bloqueada');
assert(migration.includes('ORDENAR só pode receber candidatos após VER_GATE aprovado por validação humana'), 'ORDENAR não está protegido pelo gate');
assert(migration.includes("values(v_case_id,'VER_GATE','PENDENTE'"), 'VER_GATE não nasce pendente');
assert(!migration.includes('route_signal ='), 'Motor não deve decidir rota comercial');
assert(!migration.match(/priority_score|automatic_priority|auto_priority/i), 'Banco do Motor não deve criar prioridade automática');

assert(edge.includes('verify_jwt') === false, 'verify_jwt deve ser configuração de deploy, não hardcode de runtime');
assert(edge.includes('vos_create_case_from_intake'), 'Edge não usa importador canônico');
assert(!edge.match(/anthropic|openai|gemini|claude/i), 'Importação do Motor não pode chamar IA');

for (const action of ['UPDATE_DESTINATION','UPDATE_P8','ADD_EVIDENCE','ADD_VER_ENTRY','VALIDATE_VER_ENTRY','ADD_HYPOTHESIS','ADD_HYPOTHESIS_TEST','VALIDATE_HYPOTHESIS','ADD_CONCLUSION','SET_VER_GATE']) {
  assert(verActions.includes(`action===\"${action}\"`), `Ação operacional do VER ausente: ${action}`);
}
assert(verActions.includes('all_8p_must_be_human_validated'), 'Gate VER precisa exigir os 8Ps validados por pessoa');
assert(verActions.includes('human_validated_by:c.email'), 'Conclusão precisa carregar validador humano');
assert(!verActions.match(/priority_score|automatic_priority|auto_priority/i), 'VER operacional não pode priorizar automaticamente');

assert(orderPrep.includes('gate.status!==\"APROVADO\"'), 'Preparação do ORDENAR precisa bloquear sem VER_GATE aprovado');
assert(orderPrep.includes('human_status:\"PENDENTE\"'), 'Candidato do ORDENAR deve nascer pendente');
assert(orderPrep.includes('automatic_priority:false'), 'Contrato da saída deve declarar ausência de prioridade automática');
assert(orderPrep.includes('human_validation_required:true'), 'Contrato da saída deve exigir validação humana');
assert(!orderPrep.match(/priority_score|rank|ranking|automatic_priority:true|auto_priority/i), 'Preparação do ORDENAR não pode ranquear ou priorizar automaticamente');

for (const marker of ['motor-ver-actions','Destino do caso','8Ps · leitura humana','Evidências','Hipóteses e testes','Conclusões humanas','Gate VER']) {
  assert(motorUi.includes(marker), `Interface operacional ausente: ${marker}`);
}

for (const fn of ['vos_touch_updated_at','vos_protect_case_source','vos_enforce_hypothesis_validation','vos_require_ver_gate_for_order','vos_response_value']) {
  assert(hardening.includes(`alter function public.${fn}`), `Hardening de search_path ausente: ${fn}`);
}

for (const rule of [
  'IA estrutura, sugere e redige. A aplicadora humana valida.',
  'transformar lacuna em disfunção ou causa',
  'transformar hipótese em conclusão',
  'definir prioridade humana',
  'escolher rota comercial automaticamente'
]) {
  assert(architecture.includes(rule), `Regra arquitetural ausente: ${rule}`);
}

console.log(JSON.stringify({
  ok: true,
  suite: 'MOTOR_VOS_GUARDRAILS_V1_1',
  tables: requiredTables.length,
  p8: 8,
  ver_fields: 15,
  ver_actions: 10,
  order_output: 'VOS_ORDER_INPUT_1.0',
  guardrails: 'PASS'
}));
