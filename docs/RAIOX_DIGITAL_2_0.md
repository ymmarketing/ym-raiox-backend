# Raio-X Digital 2.0 — Arquitetura oficial de evolução

Status: desenho de implementação em branch de desenvolvimento. Não alterar produção até homologação.

## 1. Problema a corrigir

O RX_CANONICO_1.0 mede bem maturidade de negócio/comercial, mas a promessa pública é Score/Jornada Digital. A entrega precisa tornar explícitas as dimensões de presença digital, posicionamento, canais, conteúdo, autoridade, prova, conversão, relacionamento e medição.

Decisão: os 8Ps continuam como camada interna do método quando forem úteis, porém o cliente passa a receber uma leitura orientada à Jornada Digital.

## 2. Contratos versionados

- questionário: `RX_DIGITAL_2.0`
- evidências: `RX_EVIDENCE_1.0`
- score: `RX_DIGITAL_SCORE_2.0`
- packet: `VOS_DIGITAL_INTAKE_2.0`
- relatório: `RX_REPORT_2.0`
- extração visual: `RX_VISION_1.0`

Nunca sobrescrever versões antigas. Intake antigo continua renderizável pela versão correspondente.

## 3. Jornada externa que o cliente verá

1. Base do negócio
2. Presença digital
3. Conteúdo e autoridade
4. Prova e confiança
5. Conversão e relacionamento
6. Medição e capacidade
7. Evidências visuais dos canais
8. Resultado

O relatório organiza a jornada em cinco visões:

- ENCONTRAR — presença, encontrabilidade e pontos de entrada
- ENTENDER — posicionamento, clareza, coerência e proposta de valor
- CONFIAR — autoridade, prova e sinais de credibilidade
- AVANÇAR — CTA, fricção, contato, orçamento/agendamento/compra
- SUSTENTAR — follow-up, CRM, origem, métricas e capacidade

## 4. Evidências visuais

### 4.1 Canais aceitos

- Instagram
- LinkedIn
- Google Perfil da Empresa
- Site / landing page
- WhatsApp Business (perfil/catálogo; nunca conversa)
- outros podem ser adicionados depois

A coleta é condicional: só pedir print do canal marcado como utilizado.

### 4.2 O que pedir

Instagram: foto/nome/@, bio, link, destaques e início do feed.
LinkedIn: topo de página/perfil, headline/descrição e elementos de prova visíveis.
Google: nome, categoria, nota/avaliações, botões, principais informações.
Site: topo/home com mensagem e CTA.
WhatsApp: somente informações comerciais públicas; nunca chats.

### 4.3 Segurança e privacidade

- aceitar apenas JPEG/PNG/WebP
- comprimir/redimensionar no browser antes do upload
- remover EXIF/metadata no cliente ao reencodar a imagem
- limite recomendado: até 1800 px no maior lado e alvo aproximado <= 2 MB por imagem
- máximo inicial: 5 evidências por intake
- bloquear SVG/PDF/ZIP na primeira versão
- nunca armazenar imagem em base64 dentro do Supabase/Postgres
- nunca tornar os arquivos públicos
- nunca enviar Direct, conversa de WhatsApp, documento pessoal ou informação sensível de cliente
- relatório deve usar URL autenticada/proxy, não URL pública permanente

## 5. Armazenamento: decisão recomendada

A Central YM já adota Google Drive como armazenamento documental e banco de dados apenas como referência. Para manter o mesmo princípio, a arquitetura alvo é:

Browser -> API de upload (Vercel) -> Google Drive -> banco salva apenas `drive_file_id` + metadados.

Pasta sugerida:

`RAIO-X/EVIDENCIAS/<intake_ref>/<channel>-<uuid>.<ext>`

### 5.1 Por que não enviar direto do browser ao Drive

O browser não deve possuir credenciais do Google. O backend precisa autenticar com conta de serviço/OAuth e fazer a gravação no Drive.

### 5.2 Alternativa de contingência

Se a integração Google Drive não estiver pronta, usar bucket privado do Supabase Storage (`raiox-evidencias`) com política de retenção e migrar para Drive depois. O banco continua guardando apenas metadados/referências.

## 6. Modelo de dados

Tabela proposta `raiox_evidence`:

- `id uuid pk`
- `intake_ref text not null`
- `intake_id uuid null`
- `channel text not null`
- `source_url text null`
- `storage_provider text not null` (`google_drive|supabase_storage`)
- `storage_file_id text not null`
- `mime_type text not null`
- `size_bytes bigint not null`
- `width int null`
- `height int null`
- `sha256 text null`
- `upload_status text not null` (`uploaded|analyzing|analyzed|failed`)
- `vision_version text null`
- `vision_analysis jsonb null`
- `vision_confidence numeric null`
- `created_at timestamptz default now()`
- `analyzed_at timestamptz null`

Nunca guardar credenciais de rede social.

## 7. Rotas novas

### POST `/api/raiox/evidence/upload`

Multipart, uma imagem por request.
Valida `ref`, tipo, tamanho, canal, token da sessão e limite de arquivos.
Reencoda/valida quando necessário, envia ao Drive e devolve metadados.

### GET `/api/raiox/evidence/:id`

Proxy autenticado para servir imagem privada ao relatório/vision quando necessário.

### POST `/api/raiox/evidence/analyze`

Entrada: `ref` ou lista de evidence ids.
Backend recupera bytes privados e envia ao modelo multimodal.
Saída: `RX_VISION_1.0` estruturado.

### DELETE `/api/raiox/evidence/:id`

Permite excluir evidência antes da conclusão e suporta política de privacidade/retenção.

## 8. Contrato de visão — RX_VISION_1.0

A IA NÃO decide score final. Ela extrai sinais visuais estruturados.

```json
{
  "channel":"instagram",
  "observed":{
    "identity_consistency":"clear|partial|unknown",
    "positioning_clarity":"clear|partial|unclear|unknown",
    "profile_completeness":"complete|partial|unknown",
    "cta_visibility":"clear|weak|absent|unknown",
    "proof_visibility":"strong|partial|absent|unknown",
    "authority_visibility":"strong|partial|absent|unknown",
    "content_structure":"structured|mixed|unstructured|unknown",
    "contact_path":"clear|partial|unknown"
  },
  "strengths":[],
  "attention":[],
  "evidence_notes":[],
  "confidence":"high|medium|low"
}
```

A saída precisa indicar explicitamente o que NÃO pôde ser inferido pelo print.

## 9. Regra de Score na primeira entrega

Fase 1: o score numérico continua baseado nas respostas estruturadas do cliente. Os prints enriquecem leitura, confirmam/contradizem percepção declarada e geram evidência visual, mas não alteram a nota automaticamente.

Motivo: evita que um modelo de visão modifique score por interpretação subjetiva antes de termos volume de homologação.

Fase 2, após homologações: introduzir `evidence_adjustment` limitado e auditável, somente em campos explicitamente observáveis e com confiança alta.

## 10. Como cruzar dado declarado + print

Cada leitura deve identificar origem:

- `DECLARED` — resposta do cliente
- `SCREENSHOT` — evidência visual enviada
- `PUBLIC_URL` — dado público consultado por backend quando suportado
- `CROSS` — cruzamento de pelo menos duas fontes

Exemplo:

Cliente declara que o CTA está claro (RXD14 = alto), porém o print do Instagram não mostra link/CTA visível. O relatório NÃO decide quem está certo. Deve dizer:

> A percepção declarada indica um caminho claro, enquanto a evidência visual enviada não torna esse próximo passo evidente no primeiro contato. Vale validar se a clareza existe em outra parte da jornada ou se depende de navegação adicional.

## 11. Estrutura externa do RX_REPORT_2.0

1. Capa + Score da Jornada Digital
2. Retrato executivo do negócio (curto)
3. Mapa da presença digital
4. Jornada digital: Encontrar / Entender / Confiar / Avançar / Sustentar
5. Leitura canal por canal (somente canais utilizados)
6. Conteúdo e autoridade
7. Prova e confiança
8. Conversão digital
9. Leituras cruzadas: negócio x digital
10. O que já funciona
11. Oportunidades observáveis
12. Hipóteses a validar
13. Testes simples / ganhos rápidos
14. O que ainda não é seguro decidir
15. Rota de aprofundamento

### Canal por canal

Para cada canal com evidência:

- print enviado (thumbnail/visual)
- o que está visível
- o que ajuda a jornada
- o que pode limitar avanço
- o que o print NÃO permite concluir
- teste recomendado

Não usar linguagem de condenação (`erro`, `péssimo`, `crítico`) no produto automático.

## 12. Limitações técnicas atuais

1. O front atual é estático em GitHub Pages e não possui tipo de pergunta/etapa para arquivos.
2. `VOS_INTAKE_1.0` aceita essencialmente respostas JSON e não possui coleção de evidências.
3. `save-raiox-intake` não recebe multipart nem gerencia arquivos.
4. Não existe hoje integração de upload com Google Drive no backend do Raio-X.
5. A camada `RX_REPORT_1.1` recebe texto estruturado; ela precisa de uma etapa multimodal separada para interpretar prints.
6. LinkedIn/Instagram/Google não devem ser tratados por scraping como dependência do produto. Screenshots fornecidos pelo próprio cliente evitam bloqueios/login e tornam a fonte rastreável.
7. O provedor de IA interpretativa atualmente configurado apresentou erro de saldo insuficiente em produção na homologação de 22/08/2026. Antes de ativar visão em produção é necessário regularizar créditos ou configurar provedor alternativo/fallback.
8. O relatório público não pode expor Drive IDs/URLs de evidências sem controle de acesso.

## 13. Migração sem quebrar produção

- manter RX_CANONICO_1.0 / RX_REPORT_1.1 ativos
- desenvolver RX_DIGITAL_2.0 em feature flag
- criar uma rota de homologação sem Asaas
- executar pelo menos 5 casos reais/simulados com perfis digitais diferentes
- comparar: completude, tempo de preenchimento, riqueza da análise, redundância, coerência e taxa de falha
- somente depois promover V2 ao checkout real

## 14. Critério de pronto

A V2 só entra em produção quando:

- formulário condicional funciona em desktop/mobile
- upload de evidências é privado e resiliente
- relatório sai mesmo se uma evidência falhar
- relatório usa realmente todos os blocos importantes do questionário
- cada observação visual é rastreável ao canal/print
- não há dependência de scraping
- não há arquivo público acidental
- score e análise não se contradizem sem explicação
- testes de ausência de canal funcionam (ex.: empresa sem Instagram, mas com LinkedIn + Google)
