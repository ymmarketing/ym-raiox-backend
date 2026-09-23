# VOS Intelligence 1.0 — auditoria de reuso do banco

Data: 21/09/2026  
Ambiente auditado: ym-raiox-production (somente leitura nesta etapa)

## Decisão
O VOS Intelligence NÃO deve criar um segundo ecossistema de dados. A base atual já contém grande parte da infraestrutura necessária e deve ser reutilizada.

## Estruturas existentes que serão preservadas
- `raiox_intakes`: intake canônico do Raio-X.
- `vos_cases`: caso VOS derivado do intake.
- `vos_evidence`: evidências.
- `vos_hypotheses` + `vos_hypothesis_tests`: hipóteses e testes.
- `vos_validations` + `vos_gates`: trilha e gates humanos.
- `vos_order_candidates`: preparação do ORDENAR.
- `vos_ver_data_profiles`: qualidade/compartilhamento de dados.
- `vos_business_metric_snapshots`: baselines do VER.
- `client_performance_kpis`: definição de KPI, baseline, meta e janela.
- `client_performance_measurements`: histórico real.
- `client_performance_actions`: ações implantadas.
- `client_performance_action_kpis`: hipótese ação -> KPI.
- `central_ym_content_items`: conteúdo.
- `central_ym_content_performance`: meta/resultado por conteúdo.
- `performance_data_sources`, `performance_metric_mappings`, `performance_sync_runs`: conectores e sincronização.
- CRM existente como fonte de pipeline.

## Incompatibilidade encontrada — 8 Ps
A tabela `vos_p8_coverage` foi criada com o vocabulário antigo:
- Produto
- Preço
- Praça
- Promoção
- Pessoas
- Processos
- Evidências físicas
- Produtividade e Qualidade

O modelo oficial do VOS Intelligence 1.0 passa a ser:
- Produto
- Preço
- Praça
- Promoção
- Pessoas
- Processos
- Posicionamento
- Performance

### Regra de migração
Não reescrever histórico. Preservar registros antigos e introduzir versionamento do modelo de 8 Ps. Novos casos devem usar `VOS_P8_1.0`. Relatórios antigos continuam legíveis com o vocabulário de origem.

## Lacunas reais do banco para o novo motor
### 1. Benchmark
Ainda não existe estrutura canônica para:
- segmento;
- B2B/B2C;
- região;
- ticket;
- canal;
- métrica;
- faixa;
- fonte;
- data;
- amostra;
- comparabilidade;
- confiança.

### 2. Target versionado
`client_performance_kpis.target_value` suporta uma meta pontual, mas o VOS Intelligence precisa também de:
- faixa low/high;
- 30/60/90 dias;
- premissas;
- fonte/benchmark;
- nível de confiança;
- versão da previsão;
- histórico de recalibração.

### 3. Microação/playbook
`client_performance_actions` já serve como linha do tempo, mas precisa representar com clareza:
- passo a passo;
- frequência;
- responsável;
- exemplo pronto;
- KPI líder;
- regra de revisão;
- janela de maturação.

### 4. Execução de IA
Precisamos de auditoria versionada por execução:
- engine_version;
- model;
- input/output tokens;
- custo;
- web search;
- fontes;
- duração;
- status/erro;
- hash do contrato;
- vínculo ao caso/cliente.

## Regra de implantação
1. Primeiro criar contrato e testes no Git.
2. Depois criar Supabase branch de desenvolvimento (requer aprovação de custo).
3. Aplicar migrations somente na branch.
4. Homologar YM.
5. Somente depois propor merge das migrations para produção.

## Cliente de homologação
A YM já existe em `crm_clients` e possui KPIs/medições configurados. Esses dados serão usados como fonte real na homologação, sem expor valores privados em arquivos públicos do GitHub.
