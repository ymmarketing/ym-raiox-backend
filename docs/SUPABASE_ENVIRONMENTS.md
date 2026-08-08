# Supabase — ambientes oficiais do Raio-X

## STAGING
- Projeto: `ym-raiox-staging`
- Project ref: `nxmcqkhaolplyzapccaf`
- Uso: testes, homologação e validação antes de produção.

## PRODUÇÃO
- Projeto: `ym-raiox-production`
- Project ref: `srzdikgztpdtwbggwniz`
- Região: `us-east-1`
- Uso: dados reais do Raio-X após o Gate de publicação.

## Contrato compartilhado
Ambos os ambientes devem manter:
- migration `create_raiox_intakes_v1`;
- tabela `public.raiox_intakes`;
- RLS habilitado e acesso direto de `anon` / `authenticated` revogado;
- Edge Function `save-raiox-intake`;
- versões `VOS_INTAKE_1.0`, `RX_CANONICO_1.0`, `RX_SCORE_1.0`, `RX_REPORT_1.0`;
- `route_signal = null`;
- `human_validation_required = true`.

A aplicação pública não deve apontar para STAGING depois da publicação oficial.
