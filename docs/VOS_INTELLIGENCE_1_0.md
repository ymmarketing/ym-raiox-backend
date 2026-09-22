# Projeto VOS Intelligence 1.0

Status: INICIADO em 21/09/2026  
Cliente de homologação ponta a ponta: YM Marketing & Negócios  
Branch: `vos-intelligence-1-0-2026-09-21`

## Regra de preservação
O fluxo comercial atual não será reconstruído:
`site -> CTA -> Asaas -> validação de pagamento -> Raio-X -> motor -> relatório`.

Produção permanece intacta enquanto a homologação ocorre em preview/branch. Nenhuma alteração no gate Asaas será feita sem teste específico.

## Objetivo
Evoluir o Raio-X Estratégico para um motor integrado que:
1. VER: consolida dados, evidências, 3 Pilares, 8 Ps, KPIs e mercado.
2. ORDENAR: identifica gargalos, hipóteses, prioridades, dependências e sequência.
3. SUSTENTAR: transforma a estratégia em microações, rotina, targets, acompanhamento e recalibração.

## Modelo oficial
### 3 Pilares
- AQUISIÇÃO: fazer as pessoas certas chegarem.
- POSICIONAMENTO: fazer o mercado entender, confiar e escolher.
- OPERAÇÃO: fazer marketing, vendas e atendimento funcionarem depois que o cliente chega.

### 8 Ps
- Produto
- Preço
- Praça
- Promoção
- Pessoas
- Processos
- Posicionamento
- Performance

## Camadas do motor
1. Data Quality Engine
2. KPI Engine
3. Diagnostic Engine
4. Benchmark Engine
5. Priority Engine
6. Target Engine
7. Playbook Engine
8. Micro Action Engine
9. Routine Engine
10. Review/Recalibration Engine

## Regra de valor percebido
Nenhuma recomendação pode terminar em abstrações como:
- "melhorar posicionamento"
- "fazer conteúdo"
- "implantar follow-up"
- "fazer tráfego"

Toda recomendação deve responder:
- O que fazer?
- Por que fazer?
- Como fazer?
- Quando/frequência?
- Quem executa?
- Exemplo pronto?
- KPI líder?
- KPI de negócio?
- Target e prazo?
- Gatilho de revisão?

## Hierarquia de indicadores
Ação -> KPI de execução -> KPI intermediário -> KPI de negócio -> KPI financeiro.

Exemplo:
CRM -> % leads registrados -> % follow-up -> conversão -> receita incremental.

## Previsão e targets
Targets nunca são promessas. São faixas condicionadas a:
- baseline real;
- histórico da própria empresa;
- benchmark comparável e datado;
- ações efetivamente implantadas;
- capacidade operacional;
- premissas explícitas;
- nível de confiança.

Se os dados forem insuficientes, o motor deve retornar "instrumentar antes de prever".

## Data Quality Gate
Classe A: dados suficientes para diagnóstico + target + projeção financeira.
Classe B: diagnóstico + targets direcionais, com limitações.
Classe C: diagnóstico de mensuração + plano de instrumentação; sem projeção financeira.

## Contrato de saída mínimo
- engine_version
- data_quality
- baselines
- kpis
- pillar_findings
- p8_findings
- root_hypotheses
- priorities
- benchmarks
- targets
- actions
- micro_actions
- routine
- projected_impact
- assumptions
- confidence
- review_schedule
- sources

## Contratos técnicos fechados no primeiro checkpoint do Work
- `VOS_INPUT_1.0`: entrada canônica, métricas normalizadas e fontes permitidas.
- `VOS_DIAGNOSTIC_1.0`: saída interpretativa dos 3 Pilares e 8 Ps.
- `RX_CANONICO_1.0`: questionário histórico de 30 respostas, preservado.
- `RX_CANONICO_2.0`: questionário de 18 respostas efetivamente liberado após o pagamento, agora também mapeado para o VIE.

O diagnóstico estruturado não contém targets, benchmarks ou projeções. Esses números permanecem em módulos determinísticos posteriores. A IA recebe KPIs já calculados e só pode interpretar evidências usando IDs presentes em `allowed_sources`.

O Data Quality Gate agora reprova números inválidos, percentuais fora da faixa e fontes com períodos misturados; relações improváveis de funil geram alerta de revisão sem transformar automaticamente o dado em erro.

Cada execução da camada interpretativa retorna auditoria mínima com versão do motor, versão do contrato, modelo, tokens, duração, status e identificador da resposta. Custo será conectado ao registro persistente na etapa de auditoria de IA, sem alterar produção nesta branch.

## Homologação YM
A YM será tratada como cliente real, mas sem cobrança Asaas na execução interna. O caminho de pagamento real continuará preservado e será testado separadamente antes do gate de produção.

Dados de referência já conhecidos para o caso YM:
- negócio: YM Marketing & Negócios;
- entrada comercial: Raio-X Estratégico;
- meta prioritária: aquisição previsível e vendas recorrentes;
- capacidade ainda disponível;
- canais e ativos já estruturados;
- necessidade de consolidar aquisição, pipeline e previsibilidade.

A homologação não pode depender apenas de respostas declaradas. Deve usar dados/evidências disponíveis e marcar como lacuna o que não estiver medido.

## Cronograma executivo
### Sprint 1 — Fundação
- contrato de dados;
- KPI Engine;
- Data Quality Gate;
- matriz 3 Pilares x 8 Ps;
- versionamento.

### Sprint 2 — Diagnóstico
- regras determinísticas;
- OpenAI como camada interpretativa;
- causa/hipótese;
- confidence score.

### Sprint 3 — Mercado e targets
- pesquisa/benchmark com fonte, data e comparabilidade;
- Target Engine;
- cenários e trajetória 30/60/90.

### Sprint 4 — Execução percebida
- biblioteca de ações;
- Playbook Engine;
- Micro Action Engine;
- Content Engine;
- Routine Engine.

### Sprint 5 — Produto
- relatório detalhado e leigo;
- proposta comercial;
- visão cliente;
- acompanhamento real x target.

### Sprint 6 — Homologação YM
- execução ponta a ponta;
- 30/60/90 simulável + dados reais;
- testes de falha;
- revisão do relatório;
- gate para produção.

## Critérios de homologação
- mesmos dados -> mesmos cálculos determinísticos;
- nenhum KPI inventado;
- benchmark com fonte, data e contexto;
- target com premissas;
- projeção sempre em faixa;
- lacuna de dado nunca vira fato;
- cada ação possui passo a passo e medição;
- cada prioridade possui evidência;
- cada execução registra versão do motor e custo de IA;
- linguagem compreensível para cliente leigo;
- fluxo Asaas preservado.
