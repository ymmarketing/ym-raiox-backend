# ETAPA 7 — HOMOLOGAÇÃO ADVERSARIAL DE STAGING

Data: 2026-08-08
Escopo: Motor Web VOS + CRM Essencial
Resultado: PASS
Execução: transacional com `ROLLBACK`; staging ficou sem resíduos de teste.

## Tentativas de violação testadas

| ID | Violação tentada | Resultado esperado | Resultado |
|---|---|---|---|
| A1 | Alterar o snapshot `source_packet` do caso VOS | Bloquear | PASS |
| A2 | Validar hipótese sem teste registrado | Bloquear | PASS |
| A3 | Criar candidato do ORDENAR antes do `VER_GATE` | Bloquear | PASS |
| A4 | Importar Raio-X no CRM e receber rota automática | Rota deve permanecer `NULL` | PASS |
| A5a | Definir rota com ator humano vazio | Bloquear | PASS |
| A5b | Definir rota sem justificativa | Bloquear | PASS |
| A6 | Forçar `ROTA_RECOMENDADA` sem rota/validador | Bloquear por constraint | PASS |
| A7 | Encontrar tabela sensível do Motor/CRM com RLS desligado | Zero ocorrências | PASS |

## Limpeza confirmada
Após `ROLLBACK`, contagens de registros `SYSTEM_TEST` em hipóteses, candidatos do ORDENAR, contatos e oportunidades: zero.

## O que este teste não substitui
- homologação funcional humana pela interface;
- Golden Case Fino Amor Cestas;
- testes adversariais de conteúdo com casos reais/semiestruturados;
- teste financeiro real Asaas do Raio-X, conscientemente adiado na produção assistida;
- validação visual/site/canais;
- GO de produção.
