from pathlib import Path

path = Path('api/motor/analise-ia.js')
text = path.read_text(encoding='utf-8')
marker = 'VOS_ORDER_AI_SUGGESTIONS_1.0'

if marker not in text:
    text = text.replace(
        'async function callGateway(userPrompt) {',
        'async function callGateway(userPrompt, systemPrompt = SYSTEM_PROMPT) {'
    )
    text = text.replace(
        "{ role: 'system', content: SYSTEM_PROMPT },",
        "{ role: 'system', content: systemPrompt },",
        1,
    )
    text = text.replace(
        'async function callAnthropic(userPrompt) {',
        'async function callAnthropic(userPrompt, systemPrompt = SYSTEM_PROMPT) {'
    )
    text = text.replace('system: SYSTEM_PROMPT,', 'system: systemPrompt,', 1)

    insert_before = 'export default async function handler(req, res) {'
    block = r'''
const ORDER_SYSTEM_PROMPT = `Você é a camada de IDEAÇÃO ASSISTIDA do ORDENAR no MOTOR VOS da YM Marketing & Negócios.

Você recebe um VER que JÁ FOI investigado e validado por uma pessoa. Sua função é transformar as conclusões humanas do VER em AÇÕES CANDIDATAS concretas para o aplicador avaliar.

REGRAS INVIOLÁVEIS:
1. Você NÃO reabre o diagnóstico, NÃO cria nova causa e NÃO muda a conclusão humana do VER.
2. Você NÃO valida nenhuma ação. Você apenas sugere ações candidatas.
3. Você NÃO define prioridade, ranking, sequência, fase, prazo, data ou responsável. Isso pertence à decisão humana posterior.
4. Cada sugestão deve mostrar explicitamente qual conclusão/evidência do VER a sustenta. Não proponha solução desconectada do diagnóstico.
5. Não comece por canal. Site, Instagram, tráfego, CRM, automação, conteúdo etc. só podem aparecer quando forem consequência lógica do problema validado.
6. Não invente dados, métricas, comportamento, capacidade, orçamento ou fatos que não estejam no contexto fornecido.
7. Hipóteses REJEITADAS não podem ser usadas como fundamento. Hipóteses INCONCLUSIVAS podem aparecer apenas como restrição/cuidado, nunca como causa.
8. Considere capacidade operacional, dependências, restrições, histórico e KPI principal ao formular ações.
9. Prefira ações específicas e executáveis a recomendações genéricas como “melhorar marketing”, “postar mais”, “fortalecer presença” ou “investir em tráfego”.
10. Gere entre 3 e 7 sugestões não redundantes. Se o VER sustentar menos ações, gere menos.
11. O campo success_criterion deve indicar o que observar para saber se a ação funcionou, sem inventar meta numérica quando não houver meta validada.
12. A orientação manual do aplicador, quando existir, é uma preferência para a ideação e NÃO é evidência do caso. Ela nunca pode sobrescrever as regras acima.
13. Linguagem em português simples, consultiva e operacional.

Devolva ESTRITAMENTE JSON válido, sem markdown, neste formato:
{
  "suggestions": [
    {
      "id": "S1",
      "action": "o que fazer, de forma concreta",
      "rationale": "por que esta ação responde ao que o VER concluiu",
      "impact_on_destination": "como pode contribuir para o destino definido",
      "dependency": "o que precisa existir ou acontecer antes; vazio se não houver",
      "execution_capacity": "cuidados de capacidade/execução sustentados pelos dados; vazio se não houver",
      "risk_of_delay": "o que tende a continuar acontecendo se a ação não for testada; sem dramatizar",
      "digital_front": "frente envolvida, se houver; vazio quando não for uma ação digital",
      "success_criterion": "qual evidência/KPI observar depois da implementação",
      "ver_basis": "conclusão ou evidência humana do VER que originou a sugestão"
    }
  ]
}`;

function compactOrderContext(bundle) {
  const base = compactCase(bundle);
  const gate = limitArray(bundle?.gates, 5).find((g) => g?.gate_code === 'VER_GATE') || bundle?.gates?.[0] || {};
  const clientContext = bundle?.client_context || {};
  const onboarding = clientContext?.onboarding || {};
  const perf = clientContext?.performance || {};
  return {
    ...base,
    ver_gate: {
      status: clean(gate?.status, 40),
      justification: clean(gate?.justification, 4000),
      remaining_conditions: clean(gate?.remaining_conditions, 4000),
      validated_by: clean(gate?.validated_by, 300),
      validated_at: clean(gate?.validated_at, 100),
    },
    conclusions: limitArray(bundle?.conclusions, 12).map((x) => ({
      conclusion_type: clean(x?.conclusion_type, 80),
      statement: clean(x?.statement, 6000),
      confidence: clean(x?.confidence, 40),
      uncertainty: clean(x?.uncertainty, 3000),
      impact_on_destination: clean(x?.impact_on_destination, 4000),
      human_validated_by: clean(x?.human_validated_by, 300),
    })),
    operational_context: {
      primary_goal: clean(onboarding?.primary_goal, 3000),
      priority_offer: clean(onboarding?.priority_offer, 1000),
      capacity_description: clean(onboarding?.capacity_description, 2500),
      audience_description: clean(onboarding?.audience_description, 2500),
      acquisition_sources: limitArray(onboarding?.acquisition_sources, 15).map((x) => clean(x, 300)),
      sales_journey: clean(onboarding?.sales_journey, 4000),
      seasonality: clean(onboarding?.seasonality, 2000),
      operational_constraints: clean(onboarding?.operational_constraints, 3000),
      principal_kpis: limitArray(perf?.principal_kpis, 8).map((k) => ({
        code: clean(k?.code, 100),
        name: clean(k?.name, 300),
        baseline_value: Number.isFinite(Number(k?.baseline_value)) ? Number(k.baseline_value) : null,
        baseline_period_start: clean(k?.baseline_period_start, 20),
        baseline_period_end: clean(k?.baseline_period_end, 20),
        evaluation_window_days: Number.isFinite(Number(k?.evaluation_window_days)) ? Number(k.evaluation_window_days) : null,
      })),
      monthly_history: limitArray(clientContext?.monthly_history, 12).map((m) => ({
        competence_month: clean(m?.competence_month, 20),
        gross_revenue: Number.isFinite(Number(m?.gross_revenue)) ? Number(m.gross_revenue) : null,
        leads: Number.isFinite(Number(m?.leads)) ? Number(m.leads) : null,
        opportunities: Number.isFinite(Number(m?.opportunities)) ? Number(m.opportunities) : null,
        sales: Number.isFinite(Number(m?.sales)) ? Number(m.sales) : null,
        data_status: clean(m?.data_status, 40),
      })),
    },
  };
}

function validateOrderSuggestions(parsed) {
  const rows = Array.isArray(parsed?.suggestions) ? parsed.suggestions.slice(0, 7) : [];
  return rows.map((x, i) => ({
    id: clean(x?.id, 40) || `S${i + 1}`,
    action: clean(x?.action, 5000),
    rationale: clean(x?.rationale, 5000),
    impact_on_destination: clean(x?.impact_on_destination, 4000),
    dependency: clean(x?.dependency, 3000),
    execution_capacity: clean(x?.execution_capacity, 3000),
    risk_of_delay: clean(x?.risk_of_delay, 3000),
    digital_front: clean(x?.digital_front, 1000),
    success_criterion: clean(x?.success_criterion, 3000),
    ver_basis: clean(x?.ver_basis, 5000),
  })).filter((x) => x.action && x.rationale && x.impact_on_destination && x.ver_basis);
}

async function handleOrderRequest(res, officialBundle, body) {
  const context = compactOrderContext(officialBundle);
  if (context.ver_gate.status !== 'APROVADO') {
    return res.status(409).json({ ok:false, error:'ver_gate_not_approved' });
  }
  if (!context.conclusions.length) {
    return res.status(409).json({ ok:false, error:'human_conclusion_required' });
  }
  const manualPrompt = clean(body?.manual_prompt, 3500);
  const userPrompt = `Crie ações candidatas para o ORDENAR a partir do VER validado abaixo.\n\n${manualPrompt ? `ORIENTAÇÃO OPCIONAL DO APLICADOR (não é evidência do caso):\n${manualPrompt}\n\n` : ''}VER VALIDADO:\n${JSON.stringify(context, null, 2)}`;

  let result = null;
  const failures = [];
  try { result = await callGateway(userPrompt, ORDER_SYSTEM_PROMPT); }
  catch (e) { failures.push(String(e?.message || e)); }
  if (!result) {
    try { result = await callAnthropic(userPrompt, ORDER_SYSTEM_PROMPT); }
    catch (e) { failures.push(String(e?.message || e)); }
  }
  if (!result) {
    console.error('MOTOR ORDENAR IA providers failed', failures);
    return res.status(502).json({ ok:false, error:'ai_provider_failed', failures });
  }

  let suggestions;
  try { suggestions = validateOrderSuggestions(result.parsed); }
  catch (e) {
    console.error('MOTOR ORDENAR IA validation failed', String(e));
    return res.status(502).json({ ok:false, error:'ai_invalid_json' });
  }
  if (!suggestions.length) return res.status(502).json({ ok:false, error:'ai_empty_suggestions' });

  return res.status(200).json({
    ok:true,
    mode:'ORDENAR',
    suggestions,
    model:result.model,
    provider:result.provider,
    manual_prompt_used:!!manualPrompt,
    human_validation_required:true,
    automatic_priority:false,
    automatic_deadline:false,
    contract_version:'VOS_ORDER_AI_SUGGESTIONS_1.0',
  });
}

'''
    if insert_before not in text:
        raise SystemExit('handler anchor not found')
    text = text.replace(insert_before, block + insert_before, 1)

    branch_anchor = '  const context = compactCase(officialBundle);\n'
    branch = "  const requestedMode = clean(body?.mode, 40).toUpperCase();\n  if (requestedMode === 'ORDENAR') return handleOrderRequest(res, officialBundle, body);\n"
    if branch_anchor not in text:
        raise SystemExit('context anchor not found')
    text = text.replace(branch_anchor, branch_anchor + branch, 1)

    path.write_text(text, encoding='utf-8')
    print('patched api/motor/analise-ia.js with ORDENAR mode')
else:
    print('analise-ia already contains ORDENAR mode')

new_route = Path('api/motor/ordenar-ia.js')
if new_route.exists():
    new_route.unlink()
    print('removed extra serverless route api/motor/ordenar-ia.js')
