# CDD interno — etapa de desenvolvimento

O CDD interno é a coleta **quantitativa assistida** para a conversa do Raio-X Estratégico. O Raio-X Digital de R$ 97 continua uma avaliação qualitativa da jornada.

## Fluxo entregue

1. Abrir o card de uma oportunidade ativa no CRM e acessar **CDD interno**.
2. Registrar mês comum, dados de vendas, investimento atual em marketing e tarefas/retrabalhos medidos. Campo vazio é desconhecido, não zero.
3. Registrar origem dos números e premissas; salvar cria uma **nova versão**, preservando as anteriores.
4. O backend calcula faturamento real → cenário, horas/custo operacional → hipótese de redução e investimento em marketing em blocos distintos.
5. Um ADMIN pode validar uma versão com fonte e justificativa. A tabela conserva autor, horário, versão e dados usados.

## Dados e segurança

- Tabela `public.ym_cdd_assessments`: referência à `crm_opportunities`, sem novo contato ou cliente. RLS ativa, sem grants a `anon`/`authenticated`; acesso somente pelo serviço interno.
- Função `ym-cdd-internal`: JWT verificado, `auth.getUser`, acesso ativo em `vos_internal_access`, `LIST`/`SAVE` para ADMIN ou APLICADOR, `VALIDATE` só para ADMIN. Escritas em oportunidade arquivada são bloqueadas.
- O motor puro `calculateCdd` recalcula no servidor; resultados enviados pelo navegador são ignorados. Não se somam receita bruta potencial, economia de custo e investimento sem atribuição.
- Uma versão salva não é sobrescrita pela próxima. Uma versão validada só recebe a transição de estado e a nota de validação; qualquer revisão deve criar nova versão.

## Limites desta rodada

Ainda não há agenda de imersão, relatório consultivo final, precificação, KPI contratual ou proposta vinculados ao CDD. Esta tela é a coleta e leitura quantitativa inicial dentro do CRM, não um novo Raio-X Digital.

## Verificação e reversão

- Teste do cálculo: `node supabase/tests/ym20_cdd_calc.mjs`; suíte do backend: `npm test`.
- Migração aplicada como `20260930034136_ym20_cdd_internal_v1`; tabela sem dados no momento da publicação. Conferir RLS e grants antes de qualquer ampliação.
- Para ocultar a funcionalidade, retirar o link `CDD interno` do CRM e desativar a Edge Function. Conservar a tabela e as versões; nenhuma reversão deve apagar avaliações já coletadas.
