# ETAPA 3 — Integração Raio-X v3.1

Status: **STAGING / NÃO PUBLICAR AINDA**

Esta branch integra somente o que já foi aprovado para o Raio-X Estratégico.

## Mantido
- Pagamento/autorização continuam no backend existente (Asaas + Upstash Redis).
- O Score, as 30 perguntas, as interpretações 0–4 e a rota `A VALIDAR` não são redefinidos aqui.
- O backend legado de relatório não é removido nesta etapa; o novo fluxo não depende dele.

## Adicionado
- Migration `create_raiox_intakes_v1` no Supabase staging.
- Edge Function `save-raiox-intake`.
- Validação do `VOS_INTAKE_1.0` antes da gravação.
- Validação da `ref` de pagamento no backend oficial antes da gravação.
- RLS habilitado e acesso direto de navegador à tabela revogado.

## Gate de produção
Esta branch não deve ser mesclada em `main` antes da homologação integrada e do GO explícito da responsável pelo produto.
