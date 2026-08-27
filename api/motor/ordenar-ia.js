import { getVercelOidcToken } from '@vercel/oidc';

/**
 * POST /api/motor/ordenar-ia
 *
 * Ideação assistida para o ORDENAR do MOTOR VOS.
 * A IA propõe ações candidatas a partir do VER já validado pelo humano.
 * A IA NÃO valida, NÃO prioriza, NÃO define sequência, prazo ou responsável.
 */

const SUPABASE_URL = 'https://srzdikgztpdtwbggwniz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OGZsWJSj2noU3Dd78pk48g__eEKE3xT';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const DIRECT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const GATEWAY_MODEL = process.env.MOTOR_AI_MODEL || 'openai/gpt-5.6-sol';
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 5000);
const PROD_ORIGIN = 'https://ymnegocios.com.br';

function allowedOrigins() {
  const env = String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((x) => x.trim()).filter(Boolean);
  return new Set([PROD_ORIGIN, ...env]);
}

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  const allowed = allowedOrigins();
  const out = allowed.has(origin) ? origin : PROD_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', out);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (origin && !allowed.has(origin)) {
    res.status(403).json({ ok:false, error:'origin_not_allowed' });
    return true;
  }
  return false;
}

function tokenFrom(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}
function clean(value, max = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function limitArray(value, max = 30) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

async function fetchOfficialBundle(token, caseId) {
  if (!token || !caseId) return null;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/motor-case-bundle`, {
    method:'POST',
    headers:{
      Authorization:`Bearer ${token}`,
      apikey:SUPABASE_PUBLISHABLE_KEY,
      'Content-Type':'application/json',
    },
    body:JSON.stringify({ case_id:caseId }),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const data = await r.json().catch(() => null);
  return data?.bundle || null;
}

function compactContext(bundle) {
  const c = bundle?.case || {};
  const gate = limitArray(bundle?.gates, 5).find((g) => g?.gate_code === 'VER_GATE') || bundle?.gates?.[0] || {};
  const clientContext = bundle?.client_context || {};
  const onboarding = clientContext?.onboarding || {};
  const performance = clientContext?.performance || {};
  return {
    case: {
      id: clean(c.id, 80),
      business_name: clean(c.business_name, 300),
      client_name: clean(c.client_name, 300),
      destination_short_term: clean(c.destination_short_term, 2500),
      destination_success_signal: clean(c.destination_success_signal, 3000),
      status: clean(c.status, 100),
    },
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
    p8_validated: limitArray(bundle?.p8_coverage, 8)
      .filter((p) => p?.human_status === 'VALIDADO')
      .map((p) => ({
        p8_code: clean(p?.p8_code, 80),
        p8_label: clean(p?.p8_label, 160),
        classification: clean(p?.classification, 80),
        confidence: clean(p?.confidence, 80),
        observation: clean(p?.observation, 5000),
        evidence_summary: clean(p?.evidence_summary, 5000),
        remaining_validation: clean(p?.remaining_validation, 3000),
      })),
    hypotheses_final: limitArray(bundle?.hypotheses, 15)
      .filter((h) => ['VALIDADA','REJEITADA','INCONCLUSIVA'].includes(h?.status))
      .map((h) => ({
        p8_code: clean(h?.p8_code, 80),
        statement: clean(h?.statement, 5000),
        status: clean(h?.status, 40),
        confidence: clean(h?.confidence, 40),
        tests: limitArray(h?.tests, 6).map((t) => ({
          test_description: clean(t?.test_description, 2500),
          result_summary: clean(t?.result_summary, 4000),
          result_classification: clean(t?.result_classification, 60),
        })),
      })),
    evidence: limitArray(bundle?.evidence, 30).map((e) => ({
      evidence_type: clean(e?.evidence_type, 100),
      title: clean(e?.title, 400),
      content: clean(e?.content, 4000),
      p8_code: clean(e?.p8_code, 80),
      reliability: clean(e?.reliability, 60),
      source_ref: clean(e?.source_ref, 400),
    })),
    business_metrics: limitArray(bundle?.business_metrics, 30).map((m) => ({
      metric_code: clean(m?.metric_code, 100),
      metric_name: clean(m?.metric_name, 250),
      period_start: clean(m?.period_start, 20),
      period_end: clean(m?.period_end, 20),
      value: Number.isFinite(Number(m?.value)) ? Number(m.value) : null,
      unit: clean(m?.unit, 40),
      validation_status: clean(m?.validation_status, 40),
    })),
    portfolio_performance: limitArray(bundle?.portfolio_performance, 80).map((p) => ({
      portfolio_item: clean(p?.portfolio_item, 300),
      portfolio_category: clean(p?.portfolio_category, 160),
      period_start: clean(p?.period_start, 20),
      period_end: clean(p?.period_end, 20),
      units_sold: Number.isFinite(Number(p?.units_sold)) ? Number(p.units_sold) : null,
      gross_revenue: Number.isFinite(Number(p?.gross_revenue)) ? Number(p.gross_revenue) : null,
      validation_status: clean(p?.validation_status, 40),
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
      principal_kpis: limitArray(performance?.principal_kpis, 8).map((k) => ({
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

const SYSTEM_PROMPT = `Você é a camada de IDEAÇÃO ASSISTIDA do ORDENAR no MOTOR VOS da YM Marketing & Negócios.

Você recebe um VER que JÁ FOI investigado e validado por uma pessoa. Sua função agora é transformar as conclusões humanas do VER em AÇÕES CANDIDATAS concretas para o aplicador avaliar.

REGRAS INVIOLÁVEIS:
1. Você NÃO reabre o diagnóstico, NÃO cria nova causa e NÃO muda a conclusão humana do VER.
2. Você NÃO valida nenhuma ação. Você apenas sugere ações candidatas.
3. Você NÃO define prioridade, ranking, sequência, fase, prazo, data ou responsável. Isso pertence à decisão humana posterior.
4. Cada sugestão deve mostrar explicitamente qual conclusão/evidência do VER a sustenta. Não proponha solução desconectada do diagnóstico.
5. Não comece por canal. Site, Instagram, tráfego, CRM, automação, conteúdo etc. só podem aparecer quando forem consequência lógica do problema validado.
6. Não invente dados, métricas, comportamento, capacidade, orçamento ou fatos que não estejam no contexto fornecido.
7. Hipóteses REJEITADAS não podem ser usadas como fundamento. Hipóteses INCONCLUSIVAS podem aparecer apenas como restrição/cuidado, nunca como causa.
8. Considere capacidade operacional, dependências, restrições e KPI principal ao formular ações.
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

function parseJson(value) {
  const raw = String(value || '').trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('json_missing');
}

function validateSuggestions(parsed) {
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

async function callGateway(userPrompt) {
  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || await getVercelOidcToken();
  if (!gatewayToken) throw new Error('gateway_auth_unavailable');
  const r = await fetch(GATEWAY_URL, {
    method:'POST',
    headers:{ Authorization:`Bearer ${gatewayToken}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      model:GATEWAY_MODEL,
      models:['anthropic/claude-opus-5','google/gemini-3.6-flash'],
      messages:[
        { role:'system', content:SYSTEM_PROMPT },
        { role:'user', content:userPrompt },
      ],
      temperature:0.25,
      max_tokens:Math.min(MAX_TOKENS, 6500),
      stream:false,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.error('MOTOR ORDENAR IA Gateway', r.status, txt.slice(0, 700));
    throw new Error(`gateway_http_${r.status}`);
  }
  const data = await r.json();
  return {
    parsed:parseJson(String(data?.choices?.[0]?.message?.content || '')),
    model:data?.model || GATEWAY_MODEL,
    provider:'vercel_ai_gateway',
  };
}

async function callAnthropic(userPrompt) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('anthropic_not_configured');
  const r = await fetch(ANTHROPIC_URL, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key':process.env.ANTHROPIC_API_KEY,
      'anthropic-version':'2023-06-01',
    },
    body:JSON.stringify({
      model:DIRECT_MODEL,
      max_tokens:Math.min(MAX_TOKENS, 6500),
      temperature:0.25,
      system:SYSTEM_PROMPT,
      messages:[{ role:'user', content:userPrompt }],
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.error('MOTOR ORDENAR IA Anthropic', r.status, txt.slice(0, 700));
    throw new Error(`anthropic_http_${r.status}`);
  }
  const data = await r.json();
  const out = (data.content || []).map((b) => b.type === 'text' ? b.text : '').join('').trim();
  return { parsed:parseJson(out), model:DIRECT_MODEL, provider:'anthropic_direct' };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok:false, error:'invalid_body' });

  const caseId = clean(body.case_id, 80);
  if (!caseId) return res.status(400).json({ ok:false, error:'case_required' });
  const token = tokenFrom(req);
  const bundle = await fetchOfficialBundle(token, caseId);
  if (!bundle) return res.status(401).json({ ok:false, error:'internal_session_or_case_required' });

  const context = compactContext(bundle);
  if (context.ver_gate.status !== 'APROVADO') {
    return res.status(409).json({ ok:false, error:'ver_gate_not_approved' });
  }
  if (!context.conclusions.length) {
    return res.status(409).json({ ok:false, error:'human_conclusion_required' });
  }

  const manualPrompt = clean(body.manual_prompt, 3500);
  const prompt = `Crie ações candidatas para o ORDENAR a partir do VER validado abaixo.\n\n${manualPrompt ? `ORIENTAÇÃO OPCIONAL DO APLICADOR (não é evidência do caso):\n${manualPrompt}\n\n` : ''}VER VALIDADO:\n${JSON.stringify(context, null, 2)}`;

  let result = null;
  const failures = [];
  try { result = await callGateway(prompt); } catch (e) { failures.push(String(e?.message || e)); }
  if (!result) {
    try { result = await callAnthropic(prompt); } catch (e) { failures.push(String(e?.message || e)); }
  }
  if (!result) {
    console.error('MOTOR ORDENAR IA providers failed', failures);
    return res.status(502).json({ ok:false, error:'ai_provider_failed', failures });
  }

  let suggestions = [];
  try { suggestions = validateSuggestions(result.parsed); }
  catch (e) {
    console.error('MOTOR ORDENAR IA invalid json', String(e));
    return res.status(502).json({ ok:false, error:'ai_invalid_json' });
  }
  if (!suggestions.length) return res.status(502).json({ ok:false, error:'ai_empty_suggestions' });

  return res.status(200).json({
    ok:true,
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
