# Auditoria de Segurança e Integrações — 2026-08-19

## Escopo

Jornada interna YM: autenticação/permissões → CRM → Raio-X/MOTOR → Dashboard → Financeiro, incluindo persistência, vínculos, efeitos de mudança de status e acesso direto ao banco.

## Invariantes validadas

1. A ficha simplificada do CRM grava de forma atômica via `crm_save_lead_sheet` e somente `service_role` possui execução direta da RPC.
2. Alterações para `RAIOX_PAGO` e `RAIOX_ENTREGUE` centralizam no banco a criação idempotente de cliente e serviço Raio-X. A mudança não depende mais da tela/Edge Function chamadora.
3. `RAIOX_ENTREGUE` conclui o mesmo serviço Raio-X; não cria duplicata.
4. `GANHO` garante cliente ativo, `closing_date` e `won_at` mesmo em alterações futuras que cheguem por outra integração.
5. `PERDIDO` garante `closing_date` e `lost_at`.
6. `DESQUALIFICADO` fica fora do denominador comercial do Dashboard e não é contabilizado como perda.
7. Receita não nasce apenas da mudança de etapa. O Financeiro recebe valores de `crm_client_services` e recebimentos de `crm_payments`; isso evita receita fictícia.
8. O teste transacional CRM → Raio-X pago → Raio-X entregue → ganho passou sem duplicar cliente/serviço e terminou com rollback/zero resíduo.
9. O teste transacional CRM → serviço contratado → pagamento PAGO → `finance_v_monthly_actuals` confirmou propagação de contratado e recebido e terminou com rollback/zero resíduo.
10. O self-test MOTOR VOS T01–T12 passou após as mudanças e terminou com rollback/zero resíduo. Continuam protegidos snapshot de origem, gate VER, validação humana de hipóteses e bloqueio de ORDENAR antes do gate.
11. Não há oportunidade GANHO sem cliente, Raio-X pago/entregue sem serviço, serviço Raio-X duplicado por oportunidade ou vínculos quebrados de intake/case.
12. Todos os intakes e casos atuais estão vinculados em CRM opportunity ou client. LUMOS é um caso válido vinculado diretamente ao cliente ativo.

## Segurança aplicada

- RLS habilitado em todas as tabelas `finance_*`.
- Acesso direto `anon` e `authenticated` revogado das tabelas e views financeiras internas.
- Views `finance_v_monthly_actuals` e `finance_v_product_metrics` usam `security_invoker=true`.
- Funções SECURITY DEFINER críticas sem execução direta por `anon`/`authenticated`.
- `crm_preserve_service_traceability` com `search_path` fixo.
- Índices adicionados às FKs/joins operacionais relevantes.
- Edge Functions internas permanecem protegidas por sessão + `vos_internal_access`; funções públicas sem JWT são deliberadas e têm controles próprios de origem/token/uso único conforme o caso.

## Dashboard

`motor-dashboard` v5 / contrato `YM_DASHBOARD_GERENCIAL_2.3`:

- exclui `DESQUALIFICADO` do denominador de conversão;
- mantém `mapped_total` para auditoria do volume bruto;
- expõe `disqualified` e `disqualification_reasons` separadamente;
- não mistura desqualificação estratégica com `PERDIDO`;
- preserva leituras de clientes, serviços, pagamentos e inteligência MOTOR.

## Financeiro

`finance-dashboard` permanece como camada autenticada sobre CRM + tabelas financeiras vivas. O teste com `service_role` confirmou que o endurecimento de RLS não quebrou as views financeiras.

Serviços `ASSISTENCIA_MENSAL` existentes não possuem alias de economia de produto, mas têm compromissos de capacidade explícitos e continuam entrando em receita/capacidade. Permanecem visíveis como não mapeados para transparência econômica, sem perda de valores.

## Exceções/itens a monitorar

- Auth: proteção contra senhas vazadas ainda precisa ser habilitada na configuração do Supabase Auth.
- MOTOR IA: houve falha recente de provedor por restrição/saldo do Vercel AI Gateway e Anthropic. O caminho manual do MOTOR e a persistência de dados não dependem dessa chamada; a análise assistida pode ficar indisponível até regularização do provedor.
- Postgres registra ruído recorrente relativo a `realtime.subscription`; a aplicação interna não usa Supabase Realtime neste fluxo. Não criar objetos `realtime` manualmente; monitorar/encaminhar à Supabase se persistir.
- Marcella/Arte em Papel está como Raio-X entregue em fluxo legado sem intake/case atual. Não inventar vínculo; usar contingência rastreável se o caso precisar entrar no MOTOR.

## Testes de regressão adicionados

- `supabase/tests/internal_integration_security_v2.sql`
- `supabase/tests/finance_crm_flow_v2.sql`

Esses testes são transacionais e devem terminar em rollback, sem resíduos de negócio.