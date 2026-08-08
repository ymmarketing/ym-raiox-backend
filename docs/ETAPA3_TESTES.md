# Testes / homologação da integração Supabase

- Migration aplicada com sucesso no projeto Supabase staging.
- `raiox_intakes` criada com RLS habilitado e acesso direto de cliente revogado.
- Registro sintético gravado e consultado com sucesso.
- Edge Function `save-raiox-intake` implantada e ativa.
- A função valida versões do VOS Intake, `route_signal=null`, `human_validation_required=true` e a `ref` de pagamento no backend antes de gravar.

Teste positivo ponta a ponta com pagamento real permanece pendente porque o Asaas do backend está configurado em produção; nenhuma cobrança de teste deve ser criada automaticamente.