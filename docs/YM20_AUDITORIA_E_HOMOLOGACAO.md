# YM 2.0 — auditoria inicial e entrega 01

Data: 29/09/2026. Escopo de referência: `YM_2_0_DOCUMENTACAO_MESTRE_DESENVOLVIMENTO.md`.

## Ambiente encontrado

| Componente | Estado observado | Decisão |
|---|---|---|
| Site público | `ymmarketing/ymnegocios`, estático, domínio em `CNAME` (`ymnegocios.com.br`); a home vendia diretamente o Raio-X por R$ 97 | Home de triagem em branch; página anterior copiada em `/raio-x-digital/`; `/raio-x.html` e checkout preservados |
| Backend de pagamento e motor | `ymmarketing/ym-raiox-backend`; dois projetos Vercel (`ym-raiox-backend` e `raioxestrategico`), com deploys da branch `vos-intelligence-1-0-2026-09-21` | Compatibilidade com o código legado `RAIO_X_ESTRATEGICO`; não alterar identificadores de pagamento, intake ou relatório nesta fase |
| Banco | Supabase `ym-raiox-production`, projeto `srzdikgztpdtwbggwniz`, sem branch de desenvolvimento ativa; `crm_contacts` (257), `crm_opportunities` (251), `crm_clients` (10), `raiox_intakes` (5) na inspeção | Migração aditiva aplicada em 29/09/2026; testes fictícios removidos |
| CRM | `motor-crm` no Supabase, com `next_action`, histórico, contatos e oportunidades; `recommended_route` legado aceita `AVULSO/FUNDACAO/NEGOCIO_DO_ZERO` | Triagem usa tabela e rota próprias; não escrever novo valor no campo legado |
| Dados do Raio-X | `source_product = RAIO_X_ESTRATEGICO`, validação rígida no intake e no backend | Manter enum técnico e IDs; alterar apenas rótulos visíveis do produto de R$ 97 por enquanto |
| Clientes operacionais | O `motor-crm` legado chama `ensureClientBase` em `RAIOX_PAGO`/`RAIOX_ENTREGUE` | Conflita com a regra da especificação; corrigir com migração e testes antes de promover novo funil |
| Documentos | Referências documentais do cliente já existem em tabelas do Supabase; uso do Drive especificado | Integração Drive ainda não auditada nesta entrega |

## Entrega 01 nas branches e no Supabase

- Site: home com CTA principal para triagem, formulário responsivo com nove dimensões, consentimento, UTMs e resultado de rota; o legado permanece acessível.
- Banco: `ym_triage_config` com pesos e corte editáveis, `ym_triages` vinculada a contato/oportunidade, e controle de volume diário.
- Endpoint: `ym-public-triage`, público, com validação, rate limit, escrita transacional via função SQL e resposta sem dados pessoais.
- CRM: a triagem cria ou reutiliza contato e oportunidade aberta, grava atividade e próxima ação. Não cria cliente operacional.
- Cálculo: 0–100 para complexidade; o faturamento não informado recebe peso neutro e fica marcado como lacuna; recomendação inicial Digital abaixo de 51 e Estratégico a partir de 51.

## Lacunas das próximas fases

1. Não havia branch de homologação Supabase. Migração `20260929042634_ym20_public_triage_v1` e função pública implantadas no projeto YM de produção, após teste SQL transacional e uma submissão fictícia ponta a ponta.
2. A submissão real retornou rota Digital e score 10; contato, oportunidade, canais e WhatsApp foram conferidos no CRM e o registro fictício foi removido. Contato ambíguo e limite diário ainda carecem de teste integrado adicional.
3. Expor triagem e override humano na ficha do CRM; os campos de override já estão previstos, mas não há interface nem ação administrativa nesta entrega.
4. Vincular a triagem à compra Digital subsequente e evitar duplicação no sincronizador de intake.
5. Revisar nome do produto em `PRODUCT_NAME` na Vercel e nos relatórios gerados; o backend ainda contém prompts e enums legados. O fallback de checkout foi atualizado, mas uma variável definida no ambiente prevalece.
6. Implementar CDD público e interno, Raio-X Estratégico consultivo, agenda, CRM vNext, pricing, KPI/success fee, propostas e conversão contratual conforme fases seguintes.
7. Revisar a criação prematura de `crm_clients` no fluxo legado e reconciliar os registros existentes sem apagar histórico.

## Verificações e rollback

- `npm test` no backend: 45 testes de smoke e guardrails do motor passaram.
- `node --check` no JavaScript público e `git diff --check`: sem erros.
- Parser HTML: nenhum `id` duplicado na home, triagem e landing Digital.
- Prévia HTML disponibilizada à usuária; submissão real fictícia executada no endpoint de produção, conferida no CRM e removida. Não há captura visual automatizada do site no domínio.
- Rollback da interface: reverter a home no site. A função pública pode ser desativada separadamente; manter tabelas e registros reais para preservar dados. Uma retirada posterior exige exportar triagens, verificar dependências e aprovar uma migração destrutiva separada.

## Publicação concluída

- Backend: [PR #9](https://github.com/ymmarketing/ym-raiox-backend/pull/9), integrado ao `main`.
- Site: [PR #17](https://github.com/ymmarketing/ymnegocios/pull/17), integrado ao `main`.
- Os dois checks Vercel do backend passaram. O domínio `ymnegocios.com.br` respondeu 200 para a home, triagem, índice de conteúdos, artigo nacional e sitemap após publicação. O envio fictício validou o endpoint e foi removido.

**Estado:** triagem e conteúdo inicial publicados no domínio e na organização ymmarketing. O restante do ecossistema YM 2.0 segue por fases.
