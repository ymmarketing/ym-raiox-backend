import fs from 'node:fs';
function assert(cond,msg){if(!cond)throw new Error(msg);}
const vos=fs.readFileSync('VOS/index.html','utf8');
const crm=fs.readFileSync('CRM/index.html','utf8');
const order=fs.readFileSync('supabase/functions/motor-order-actions/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260811101500_add_vos_order_human_sequence_v1.sql','utf8');
const vercel=fs.readFileSync('vercel.json','utf8');
const motorAuth=fs.readFileSync('motor-auth-confirm.html','utf8');
const crmAuth=fs.readFileSync('crm-auth-confirm.html','utf8');
const crmApi=fs.readFileSync('supabase/functions/motor-crm/index.ts','utf8');

for(const marker of ['Motor VOS','VER → ORDENAR','Cobertura dos 8Ps','Hipóteses e testes','Gate VER','ORDENAR','motor-order-actions'])assert(vos.includes(marker),`VOS final sem marcador: ${marker}`);
assert(vos.includes('A sequência é definida exclusivamente por uma pessoa'),'VOS não explicita sequência humana');
assert(vos.includes('SUSTENTAR não integra o escopo desta versão'),'Escopo de SUSTENTAR não está explícito');
assert(!vos.match(/automatic_priority\s*:\s*true|auto.?rank|priority_score/i),'VOS final não pode priorizar automaticamente');

for(const marker of ['CRM Essencial','Próxima ação obrigatória','SET_NEXT_ACTION','Validar rota humana','Histórico de etapas','Abrir caso no Motor VOS'])assert(crm.includes(marker),`CRM final sem marcador: ${marker}`);
assert(crm.includes("s!=='ROTA_RECOMENDADA'"),'Interface deve impedir salto manual para ROTA_RECOMENDADA');

for(const action of ['CREATE_CANDIDATE','VALIDATE_CANDIDATE','REJECT_CANDIDATE'])assert(order.includes(action),`API ORDENAR sem ação: ${action}`);
assert(order.includes('sequence_order'),'ORDENAR sem sequência humana');
assert(order.includes('validated_by:c.email'),'ORDENAR não identifica validador humano');
assert(order.includes('automatic_priority:false'),'Contrato ORDENAR não declara ausência de prioridade automática');
assert(order.includes('human_validation_required:true'),'Contrato ORDENAR não exige validação humana');
assert(!order.match(/anthropic|openai|gemini|claude|ranking|priority_score/i),'API ORDENAR não pode usar IA/ranking automático');

assert(migration.includes('sequence_order'),'Migration sem sequência');
assert(migration.includes('uq_vos_order_validated_sequence'),'Sequência validada não é única por caso');
assert(migration.includes("human_status <> 'VALIDADO' or not_now = true or sequence_order is not null"),'Candidato validado precisa sequência quando não é não-agora');

assert(crmApi.includes("crm_stage_history"),'API CRM não expõe histórico de etapas');
assert(crmApi.includes("SET_NEXT_ACTION"),'API CRM sem próxima ação');
assert(crmApi.includes("SET_ROUTE"),'API CRM sem rota humana');
assert(!crmApi.match(/anthropic|openai|gemini|claude|auto.?route|route.?score/i),'CRM não pode decidir rota por IA/heurística');

assert(vercel.includes('"/VOS"')&&vercel.includes('"/CRM"'),'Rotas finais do staging ausentes');
assert(motorAuth.includes("location.replace('/VOS')"),'Callback Motor não abre /VOS');
assert(crmAuth.includes("location.replace('/CRM')"),'Callback CRM não abre /CRM');
assert(vos.includes('logo-ym-horizontal.webp')&&crm.includes('logo-ym-horizontal.webp'),'Interfaces finais não usam logo oficial');

console.log(JSON.stringify({ok:true,suite:'YM_CANDIDATO_FINAL_GUARDRAILS_1.0',motor:'PASS',crm:'PASS',ordenar:'PASS',routes:'PASS',human_authority:'PASS'}));
