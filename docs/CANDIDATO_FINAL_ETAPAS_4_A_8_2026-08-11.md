# CANDIDATO FINAL — ETAPAS 4 A 8

Data: 2026-08-11
Ambiente: staging
Branch integrada: `vos-etapa5-crm-essencial-2026-08-08`
Status: PRONTO PARA HOMOLOGAÇÃO HUMANA PONTA A PONTA

## Princípio de fechamento
Construção, regressão e testes técnicos foram executados sem substituir decisões humanas metodológicas. Produção só recebe Motor/CRM após homologação E2E e GO explícito.

## ETAPA 4 — Motor Web VOS
### Pronto tecnicamente
- Intake VOS_INTAKE_1.0 → VOS_CASE_1.0.
- Snapshot imutável.
- VER com 8Ps, evidências, 15 campos, hipóteses/testes e conclusões humanas.
- Hipótese não valida sem teste.
- VER_GATE humano.
- ORDENAR bloqueado antes do Gate.
- Interface final integrada em `/VOS`.
- ORDENAR com ações candidatas PENDENTES.
- Sequência exclusiva de validação humana (`sequence_order`).
- “Não agora” suportado sem forçar sequência.
- Sequência duplicada por caso bloqueada por banco.
- Nenhum ranking/prioridade automática.
- Auditoria e auth por Magic Link.

### Pendente apenas humano
- validação dos 8Ps do Golden Case;
- decisão sobre hipóteses/conclusões;
- VER_GATE;
- sequência das ações no ORDENAR.

## ETAPA 5 — CRM Essencial
### Pronto tecnicamente
- contatos e oportunidades;
- pipeline oficial;
- entrada manual;
- Raio-X → CRM;
- caso VOS → CRM;
- próxima ação obrigatória + prazo;
- histórico completo de mudanças de etapa;
- atividades;
- rota comercial apenas humana + justificativa + validador;
- salto para ROTA_RECOMENDADA sem rota humana bloqueado;
- interface final integrada em `/CRM`;
- link CRM → Motor VOS;
- API JWT + allowlist + auditoria;
- RLS deny-by-default nas tabelas sensíveis.

### Pendente apenas humano
- homologação de usabilidade ponta a ponta.

## ETAPA 6 — Site + canais
### Candidato técnico
- Raio-X público permanece em produção assistida na raiz.
- rotas internas candidatas construídas no staging: `/VOS` e `/CRM`;
- logo oficial aplicada nas interfaces internas;
- rotas com `noindex`, `nofollow`, `no-store`;
- publicação das rotas internas no domínio oficial permanece pós-GO.

### Acabamento público já conhecido e não bloqueante
- correção de nitidez da foto da Home do Raio-X;
- correção/garantia do asset da logo da Home pública.

## ETAPA 7 — Homologação geral
### Aprovado tecnicamente
- CI Motor VOS: verde.
- CI CRM: verde.
- CI integrado do candidato final: verde.
- testes adversariais anteriores: PASS.
- RLS ativo nas tabelas sensíveis.
- E2E técnico ORDENAR: PASS.
- E2E técnico CRM: PASS.
- registros sintéticos removidos após os testes.
- Golden Case Fino Amor preparado sem validações humanas artificiais.

### Segurança
O desenho usa RLS habilitado e ausência intencional de policies de leitura/escrita direta nas tabelas internas; operações passam pelas APIs internas com service role após autenticação/allowlist. O advisor sinaliza essas ausências como INFO, coerente com o desenho deny-by-default. Há também aviso de leaked-password protection desabilitada; a área interna usa Magic Link, não senha, portanto o aviso não bloqueia esta homologação.

## ETAPA 8 — acabamento / fechamento técnico
### Preparado
- versão candidata identificada por branch e commits;
- rotas internas consolidadas;
- CI integrado;
- Golden Case congelado em documento;
- lista de pendências finais separada de pendências financeiras;
- produção preservada sem merge prematuro.

## Pendência financeira conscientemente pausada
Fora do Gate deste candidato:
- pagamento real Asaas;
- webhook com transação real;
- liberação automática comprovada após transação real.

Os testes já comprovaram criação de cobrança/checkout e o gate de entrada. A transação real continuará marcada como PENDÊNCIA FINANCEIRA DE PRODUÇÃO até ser retomada.

## Escopo de SUSTENTAR
SUSTENTAR não integra esta versão operacional do Motor Web. A etapa corrente entrega VER + Gate + ORDENAR e integração CRM. Não criar escopo adicional para SUSTENTAR no fechamento deste candidato.

# ROTEIRO ÚNICO DE HOMOLOGAÇÃO HUMANA E2E

## A. Motor VOS
1. Entrar em `/VOS` por Magic Link.
2. Abrir `Fino Amor Cestas`.
3. Conferir patrimônio, evidências, lacunas e dado dos empórios.
4. Revisar os 8Ps pré-estruturados e validar/ajustar um a um.
5. Conferir H1/H2 suportadas e H3/H4 inconclusivas.
6. Registrar decisões humanas sobre hipóteses somente se a análise fizer sentido.
7. Registrar eventual conclusão humana somente se houver base suficiente; é aceitável não criar causa conclusiva.
8. Preencher destino/sinal de sucesso quando houver base humana para isso.
9. Aprovar ou reprovar o VER_GATE com justificativa.
10. Se Gate aprovado, criar ações candidatas no ORDENAR.
11. Validar/rejeitar ações e definir sequência humana.
12. Confirmar que nenhuma prioridade apareceu sozinha.

## B. CRM Essencial
1. Abrir `/CRM`.
2. Localizar Fino Amor Cestas.
3. Confirmar vínculo Raio-X + Motor.
4. Revisar próxima ação obrigatória.
5. Alterar próxima ação e prazo.
6. Registrar atividade.
7. Mover uma etapa válida e conferir histórico.
8. Confirmar que `ROTA_RECOMENDADA` não aparece como salto manual livre.
9. Definir uma rota somente se houver decisão comercial humana e registrar justificativa.
10. Confirmar persistência após atualizar/reabrir a página.

## C. Responsividade e percepção operacional
Executar ao menos uma passagem desktop e uma passagem mobile, observando:
- legibilidade;
- facilidade de encontrar ações;
- textos técnicos excessivos;
- campos confusos;
- sensação de fluxo;
- erros, travamentos ou perda de estado.

## Critério de GO
Após o E2E humano:
1. consolidar achados em uma única rodada de correções;
2. rodar novamente CI + regressão;
3. aprovar GO explícito;
4. publicar `/VOS` e `/CRM` no domínio oficial;
5. manter a pendência financeira real separada até o teste Asaas ser retomado.
