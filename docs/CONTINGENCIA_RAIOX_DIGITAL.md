# Raio-X Digital — contingência para falha do site

## Escopo

O link independente é `https://ym-raiox-backend.vercel.app/contingencia/`. A página de acesso, o questionário e o relatório ficam no domínio do backend. As 18 perguntas e o renderizador de relatório são uma cópia da versão oficial em `ymnegocios/raio-x-app-base.html`, com a mesma API `/api/raiox/interpretar-v2` e o mesmo score qualitativo de seis indicadores de 0 a 10. A VSL tem um campo de configuração vazio até que o vídeo oficial seja aprovado. O resultado termina com a reunião de esclarecimento incluída, por WhatsApp.

## Atendimento

1. A YM emite ou localiza a cobrança de R$ 97 no Asaas fora do site.
2. **Confirma no Asaas que o pagamento está recebido.** Um comprovante enviado pelo cliente, isoladamente, não libera o acesso.
3. Envia ao cliente o link acima e **um** código ainda não usado da lista privada de contingência. Anota cliente, pagamento Asaas e código entregue. Não envia a lista completa.
4. O cliente informa o código. O backend o resgata uma única vez, cria uma referência aprovada no Redis e abre `/contingencia/raio-x-app.html?ref=...`.
5. O cliente preenche as 18 perguntas, pode anexar links/prints, recebe o relatório pelo mesmo motor do site e agenda a reunião de esclarecimento. Ele deve salvar o link com `ref` para retomar e consultar o resultado; o código não precisa ser usado novamente.

## Limites e sincronização

- A planilha `YM — Raio-X Contingência` registra perguntas e respostas para atendimento manual; ela **não calcula score nem gera o relatório oficial**. A planilha de análise de KPIs é outra ferramenta de reunião, não faz parte do Raio-X Digital.
- O link continua funcionando se o site principal ou o checkout do site estiverem fora do ar **desde que backend, Redis e serviço de análise estejam disponíveis**. Se o backend também cair, registre as respostas na planilha e gere o relatório quando voltar. Não prometa relatório instantâneo nessa condição.
- A interface foi copiada para manter a experiência equivalente. Mudanças futuras nas perguntas ou no relatório oficial exigem copiar novamente `raio-x-app.html` e `raio-x-app-base.html`, trocar apenas o caminho do iframe para `/contingencia/raio-x-app-base.html` e executar a checagem de paridade antes de publicar.
- A referência salva no link identifica o relatório. Trate o link como privado. O código é individual, aleatório e de uso único; a lista de códigos em texto **nunca** entra no repositório.
- A geração pode variar entre sessões independentes da IA; para a mesma `ref`, o backend devolve o relatório já salvo.
