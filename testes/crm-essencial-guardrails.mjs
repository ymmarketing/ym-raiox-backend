import fs from 'node:fs';
function assert(cond,msg){if(!cond)throw new Error(msg);}
const core=fs.readFileSync('supabase/migrations/20260808140400_create_crm_essencial_v1.sql','utf8');
const hard=fs.readFileSync('supabase/migrations/20260808140500_harden_crm_essencial_v1.sql','utf8');
const manual=fs.readFileSync('supabase/migrations/20260808140600_add_crm_manual_lead_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/motor-crm/index.ts','utf8');
const ui=fs.readFileSync('crm-vos.html','utf8');

for(const t of ['crm_contacts','crm_opportunities','crm_stage_history','crm_activities'])assert(core.includes(`public.${t}`),`Tabela CRM ausente: ${t}`);
const stages=['LEAD_MAPEADO','LEITURA_EM_PRODUCAO','LEITURA_ENVIADA','FOLLOW_UP','CONVERSA_AGENDADA','RAIOX_OFERTADO','RAIOX_PAGO','RAIOX_ENTREGUE','ROTA_RECOMENDADA','PROPOSTA','GANHO','PERDIDO','IMPLANTACAO'];
for(const s of stages){assert(core.includes(`'${s}'`),`Etapa oficial ausente: ${s}`);assert(edge.includes(`'${s}'`),`API sem etapa oficial: ${s}`);}
for(const r of ['AVULSO','FUNDACAO','NEGOCIO_DO_ZERO']){assert(core.includes(`'${r}'`),`Rota ausente no banco: ${r}`);assert(edge.includes(`'${r}'`),`Rota ausente na API: ${r}`);}
assert(core.includes('route_validated_by is not null and route_validated_at is not null'),'Rota não exige validador humano no banco');
assert(core.includes('Validador humano é obrigatório'),'Função de rota não exige ator humano');
assert(core.includes("current_stage='ROTA_RECOMENDADA'"),'Validação humana não move para Rota Recomendada');
assert(core.includes("Nenhuma rota foi definida automaticamente"),'Importação de Intake não declara ausência de rota automática');
assert(hard.includes('crm_route_stage_requires_human_check'),'Hardening do estágio de rota está ausente');
assert(manual.includes("'LEAD_MAPEADO'"),'Lead manual não nasce em Lead Mapeado');
assert(edge.includes("SET_ROUTE"),'API não expõe validação explícita de rota');
assert(edge.includes("route_rationale_required"),'API não exige justificativa de rota');
assert(!edge.match(/anthropic|openai|gemini|claude/i),'CRM não deve usar IA para decidir pipeline/rota');
assert(!edge.match(/auto.?route|route.?score|priority.?score|ranking/i),'CRM não pode conter heurística automática de rota/prioridade');
for(const marker of ['Pipeline comercial','Nova entrada manual','Raio-X ainda não sincronizado','Casos VOS ainda não vinculados','Validar rota humana','O CRM não escolhe serviço automaticamente'])assert(ui.includes(marker),`Interface CRM sem marcador: ${marker}`);
console.log(JSON.stringify({ok:true,suite:'YM_CRM_ESSENCIAL_GUARDRAILS_1.0',tables:4,stages:stages.length,routes:3,human_route_gate:true,guardrails:'PASS'}));
