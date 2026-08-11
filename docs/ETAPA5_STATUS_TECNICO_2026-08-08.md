# ETAPA 5 — STATUS TÉCNICO DO CRM ESSENCIAL YM

Data: 2026-08-08
Ambiente: staging
Status: NÚCLEO + API + INTERFACE + CI CONCLUÍDOS / HOMOLOGAÇÃO FUNCIONAL HUMANA PENDENTE

## Entregue
- Contatos.
- Oportunidades.
- Pipeline comercial oficial.
- Histórico de mudança de etapa.
- Atividades e follow-up.
- Entrada manual em `LEAD_MAPEADO`.
- Importação de `VOS_INTAKE_1.0` em `RAIOX_ENTREGUE`.
- Vínculo com `VOS_CASE_1.0`.
- Rota `AVULSO | FUNDACAO | NEGOCIO_DO_ZERO` somente com justificativa e validador humano.
- Constraint impede `ROTA_RECOMENDADA` sem validação humana.
- API interna `motor-crm` protegida por JWT + allowlist.
- Interface `crm-vos.html`.
- Magic Link com callback próprio do CRM.
- Auditoria `CRM_VIEW` e `CRM_ACTION`.
- RLS com acesso direto negado; APIs usam service role.
- CI `YM_CRM_ESSENCIAL_GUARDRAILS_1.0` verde.

## Testes transacionais aprovados
1. Intake cria oportunidade em `RAIOX_ENTREGUE` sem rota automática.
2. Caso VOS é vinculado pela origem do Intake.
3. Rota sem ator humano é recusada.
4. Rota com justificativa + ator é persistida e move para `ROTA_RECOMENDADA`.
5. Testes executados com `ROLLBACK`.

## Governança
O CRM registra e operacionaliza decisões. Ele não interpreta Score para escolher serviço, não cria prioridade metodológica e não substitui a validação humana de rota.

## Gate restante
Homologação funcional humana da interface em staging antes de qualquer merge/publicação.

PR encadeado: Etapa 5 deve ser revisada sobre a base da Etapa 4; nenhuma das duas deve ser publicada sem GO explícito.
