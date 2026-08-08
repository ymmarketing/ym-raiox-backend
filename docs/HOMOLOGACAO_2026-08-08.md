# Homologação Etapa 3 — 2026-08-08

- Projeto Supabase produção criado: `ym-raiox-production`.
- Migration `create_raiox_intakes_v1` aplicada.
- Edge Function `save-raiox-intake` ativa.
- Teste positivo por acesso manual de uso único concluído sem cobrança.
- Persistência real confirmada no Supabase produção com HTTP 201.
- `VOS_INTAKE_1.0`, `RX_CANONICO_1.0`, `RX_SCORE_1.0`, `RX_REPORT_1.0`, `route_signal=null` e `human_validation_required=true` confirmados.
- Registro sintético removido após verificação; banco retornou a 0 registros.
- Harness e endpoint temporários de homologação removidos da branch.
- Código mestre permanece desativado em produção por regra do backend.

Pendente antes do merge/publicação: homologação de pagamento real Asaas → webhook → `approved` → fluxo completo.
