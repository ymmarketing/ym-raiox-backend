import fs from 'node:fs';
function assert(cond,msg){if(!cond)throw new Error(msg);}

const motor=fs.readFileSync('MOTOR/index.html','utf8');
const crm=fs.readFileSync('CRM/index.html','utf8');
const shell=fs.readFileSync('assets/internal-shell.js','utf8');
const shellCss=fs.readFileSync('assets/internal-shell.css','utf8');
const login=fs.readFileSync('interno/index.html','utf8');
const reset=fs.readFileSync('interno/redefinir/index.html','utf8');
const order=fs.readFileSync('supabase/functions/motor-order-actions/index.ts','utf8');
const crmApi=fs.readFileSync('supabase/functions/motor-crm/index.ts','utf8');
const authApi=fs.readFileSync('supabase/functions/motor-request-magic-link/index.ts','utf8');
const orderMigration=fs.readFileSync('supabase/migrations/20260811130848_add_vos_order_human_sequence_v1.sql','utf8');
const crmVisualMigration=fs.readFileSync('supabase/migrations/20260811183000_extend_crm_visual_profile_v1.sql','utf8');
const perms=fs.readFileSync('supabase/migrations/20260811174631_restore_service_role_internal_dml_v2.sql','utf8');
const relationPerms=fs.readFileSync('supabase/migrations/20260811174712_restore_service_role_relation_tables_v3.sql','utf8');
const vercel=fs.readFileSync('vercel.json','utf8');
const identidade=fs.readFileSync('Identidade/index.html','utf8');
const quemSomos=fs.readFileSync('quemsomos/index.html','utf8');
const areaCliente=fs.readFileSync('areadocliente/index.html','utf8');

for(const marker of ['MOTOR VOS','Cobertura dos 8Ps','Hipóteses e testes','Gate VER','ORDENAR','motor-order-actions']) assert(motor.includes(marker),`MOTOR final sem marcador: ${marker}`);
assert(motor.includes('/CRM'),'MOTOR precisa navegar para CRM');
assert(motor.includes('YM.shell(\'MOTOR\'')||motor.includes("YM.shell('MOTOR'"),'MOTOR não usa shell universal');
assert(!motor.match(/automatic_priority\s*:\s*true|auto.?rank|priority_score/i),'MOTOR não pode priorizar automaticamente');

for(const marker of ['Clientes e oportunidades','Lista de leads e clientes','Leitura Inicial','Próxima ação obrigatória','SET_INITIAL_READING','Validar rota humana','Histórico']) assert(crm.includes(marker),`CRM final sem marcador: ${marker}`);
assert(crm.includes('class="chev"'),'CRM precisa ter seta/expansão por lead');
assert(crm.includes('id="search"')&&crm.includes('id="fStage"')&&crm.includes('id="fClass"'),'CRM precisa permitir busca e filtros');
assert(crm.includes('/MOTOR?case='),'CRM precisa abrir o caso conectado no MOTOR');
assert(crm.includes("x!=='ROTA_RECOMENDADA'"),'Interface deve impedir salto manual livre para ROTA_RECOMENDADA');

for(const action of ['CREATE_CANDIDATE','VALIDATE_CANDIDATE','REJECT_CANDIDATE']) assert(order.includes(action),`API ORDENAR sem ação: ${action}`);
assert(order.includes('sequence_order'),'ORDENAR sem sequência humana');
assert(order.includes('validated_by:c.email'),'ORDENAR não identifica validador humano');
assert(order.includes('automatic_priority:false'),'Contrato ORDENAR não declara ausência de prioridade automática');
assert(order.includes('human_validation_required:true'),'Contrato ORDENAR não exige validação humana');
assert(!order.match(/anthropic|openai|gemini|claude|ranking|priority_score/i),'API ORDENAR não pode usar IA/ranking automático');

for(const action of ['SET_INITIAL_READING','SET_CONTACT_STATUS','UPDATE_PROFILE','SET_NEXT_ACTION','SET_ROUTE']) assert(crmApi.includes(`action==='${action}'`),`API CRM sem ação: ${action}`);
assert(crmApi.includes('initial_reading_url'),'API CRM não expõe arquivo/link da Leitura Inicial');
assert(crmApi.includes('crm_stage_history'),'API CRM não expõe histórico de etapas');
assert(!crmApi.match(/anthropic|openai|gemini|claude|auto.?route|route.?score/i),'CRM não pode decidir rota por IA/heurística');

assert(login.includes('signInWithPassword'),'Login interno precisa usar e-mail + senha');
assert(login.includes('Primeiro acesso ou esqueci minha senha'),'Login deve manter recuperação segura sem Magic Link no uso diário');
assert(reset.includes('updateUser({password:p1})'),'Tela de definição precisa salvar a senha');
assert(shell.includes('persistSession:true'),'Sessão precisa persistir entre módulos');
for(const path of ['/CRM','/MOTOR','/Identidade','/quemsomos','/areadocliente']) assert(shell.includes(path)||vercel.includes(path),`Menu/roteamento sem ${path}`);
assert(shellCss.includes('--ym-navy')&&shellCss.includes('--ym-indigo'),'Shell visual precisa usar tokens da marca');

assert(orderMigration.includes('sequence_order')&&orderMigration.includes('uq_vos_order_validated_sequence'),'Migration ORDENAR sem sequência humana única');
for(const col of ['initial_reading_url','external_key','public_signal','opportunity_to_validate','recommended_channel']) assert(crmVisualMigration.includes(col),`Migration CRM visual sem ${col}`);
assert(crmVisualMigration.includes('crm_bulk_upsert_leads'),'Migration CRM sem importação idempotente');
assert(crmVisualMigration.includes("grant execute on function public.crm_create_manual_lead")&&crmVisualMigration.includes('to service_role'),'Criação manual de lead precisa de permissão do service_role');
assert(perms.includes('revoke all on table public.crm_opportunities from anon, authenticated'),'CRM deve permanecer fechado para acesso direto');
assert(relationPerms.includes('vos_entry_evidence')&&relationPerms.includes('vos_test_evidence'),'Tabelas de relação do MOTOR sem permissão interna');

for(const path of ['/CRM','/MOTOR','/Identidade','/interno','/quemsomos','/areadocliente']) assert(vercel.includes(`\"${path}\"`),`Vercel sem rota ${path}`);
assert(vercel.includes('"/VOS"')&&vercel.includes('"/MOTOR"'),'Rota legada /VOS precisa redirecionar para /MOTOR');
assert(identidade.includes('IDEAÇÃO')&&quemSomos.includes('ideação')&&areaCliente.includes('ideação'),'Módulos em ideação não devem fingir escopo pronto');

assert(authApi.includes('generateLink({type:"recovery",email})'),'Recuperação precisa usar link seguro');
assert(authApi.includes('/interno/redefinir'),'Recuperação precisa cair na tela interna de senha');

console.log(JSON.stringify({
  ok:true,
  suite:'YM_CANDIDATO_FINAL_GUARDRAILS_1.2',
  motor:'PASS',crm:'PASS',ordenar:'PASS',routes:'PASS',password_auth:'PASS',shared_session:'PASS',
  reading_traceability:'PASS',visual_shell:'PASS',permissions:'PASS',human_authority:'PASS'
}));
