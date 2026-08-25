# CENTRAL YM — Performance e Evidências

Status: desenvolvimento em branch; não aplicar em produção sem homologação explícita.

## Fluxo de dados

1. `client_performance_kpis` define o indicador, formato, direção, baseline e meta.
2. `client_performance_measurements` preserva a série histórica mensal e a evidência de cada valor.
3. `client_performance_actions` registra o que foi implantado e quando.
4. `client_performance_action_kpis` liga uma ação aos KPIs que, por hipótese, ela deve afetar.
5. `central_ym_content_performance` registra meta e realizado por conteúdo.
6. CRM/Central editam os dados; Dashboard consolida; Área do Cliente recebe apenas registros marcados como visíveis.

A ligação ação–KPI representa hipótese e janela de observação. Não deve ser apresentada como prova automática de causalidade.

## Contrato da função `performance-admin`

- `OVERVIEW`: resumo da carteira para o Dashboard.
- `GET_CLIENT`: KPIs, medições, ações, conteúdos e fontes de um cliente.
- `UPSERT_KPI`: definição do KPI, baseline e meta.
- `UPSERT_MEASUREMENT`: resultado de um período com fonte/evidência.
- `UPSERT_ACTION`: ação implantada e KPIs relacionados.
- `GET_CONTENT`: briefing e métricas de um conteúdo.
- `UPDATE_CONTENT_CONTEXT`: objetivo e metadados usados na geração do prompt.
- `UPSERT_CONTENT_METRIC`: meta e realizado do conteúdo.

Todas as operações exigem sessão interna ativa. As tabelas têm RLS ativa e não são expostas diretamente a `anon` ou `authenticated`.

## Preparação do Reportei

O conector final deverá usar:

- `performance_data_sources`: uma fonte por cliente/projeto, sem token em banco;
- `performance_metric_mappings`: tradução da chave externa para o KPI canônico;
- `performance_sync_runs`: auditoria de leitura, escrita, cursor e erros;
- `client_performance_measurements.external_record_key`: idempotência;
- `credentials_secret_ref`: somente referência ao segredo armazenado no cofre/ambiente.

O Reportei será uma fonte de medições. A CENTRAL YM permanece como fonte de verdade para definição de KPI, baseline, meta, visibilidade e vínculo com ações.

## Meta financeira

`finance_target_history` guarda uma meta por mês de vigência. A função `finance-targets`:

- permite alteração somente por ADMIN;
- preserva competências anteriores;
- sincroniza a meta corrente com `finance_assumptions.MONTHLY_REVENUE_TARGET` para manter consumidores legados;
- registra histórico e auditoria.
