# ETAPA 4 — Arquitetura do Motor Web VOS v1

Status: EM CONSTRUÇÃO EM STAGING. Não altera o Raio-X em produção.

## Princípio obrigatório
IA estrutura, sugere e redige. A aplicadora humana valida. O motor determinístico julga somente regras já aprovadas.

Nenhuma automação pode:
- transformar lacuna em disfunção ou causa;
- transformar hipótese em conclusão;
- definir causa-raiz sem evidência suficiente;
- definir prioridade humana;
- escolher rota comercial automaticamente.

## Entrada oficial
O Motor recebe `VOS_INTAKE_1.0` produzido pelo Raio-X.

A importação:
- pré-preenche o caso;
- preserva respostas e proveniência;
- preserva Score e cobertura como referência de maturidade;
- NÃO aprova gate;
- NÃO converte Score em causa, prioridade ou rota.

## Fluxo canônico
CLIENTE DISSE → OBSERVAMOS → EVIDÊNCIA/ORIGEM → CLASSIFICAÇÃO → HIPÓTESE → COMO FOI TESTADA → CONCLUSÃO + CONFIANÇA → IMPACTO NO DESTINO → ORDEM DE AÇÃO.

Classificações permitidas:
- ATIVO
- DISFUNCAO
- LACUNA
- INCONCLUSIVO

Confiança permitida:
- ALTA
- MEDIA
- BAIXA
- SEM_BASE

## 8Ps
Cada P deve registrar separadamente:
- observação;
- evidência/origem;
- leitura;
- confiança;
- validação restante.

Ausência de dado permanece `LACUNA` ou `INCONCLUSIVO`.

## Gates humanos
Resultados causais, prioridades, ordem de ação e rota comercial só podem se tornar finais depois de validação humana explícita e rastreável.

## Ambientes
- Produção: Raio-X v3.1 permanece operacional e assistido.
- Staging: desenvolvimento e testes do Motor Web.
- Produção do Motor: somente após homologação da Etapa 4.

## Escopo inicial de implementação
1. criar caso VOS a partir de um Intake;
2. preservar o Intake original sem mutação;
3. registrar evidências e observações com origem;
4. registrar classificação e confiança;
5. registrar hipóteses e seus testes;
6. impedir conclusão causal automática;
7. manter trilha de validação humana;
8. preparar saída estruturada para ORDENAR sem executar priorização automática.
