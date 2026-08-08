const PROD_BACKEND = 'https://ym-raiox-backend.vercel.app';
const PROD_SUPABASE = 'https://srzdikgztpdtwbggwniz.supabase.co/functions/v1/save-raiox-intake';

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return json(res, 404, { ok: false, error: 'not_found' });
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const codigo = String(body?.codigo || '').trim().toUpperCase();
  if (!codigo || codigo.length < 6) {
    return json(res, 400, { ok: false, stage: 'manual_access', error: 'codigo_invalido' });
  }

  let accessResp;
  let access;
  try {
    accessResp = await fetch(`${PROD_BACKEND}/api/acesso/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    });
    access = await accessResp.json().catch(() => ({}));
  } catch {
    return json(res, 502, { ok: false, stage: 'manual_access', error: 'backend_unavailable' });
  }

  if (!accessResp.ok || !access?.ok || access?.status !== 'approved' || !access?.ref) {
    return json(res, accessResp.status || 403, {
      ok: false,
      stage: 'manual_access',
      expected_master_rejection: codigo.startsWith('YM-MASTER'),
      error: access?.error || 'access_not_approved',
      jaUsado: !!access?.jaUsado,
    });
  }

  const now = new Date().toISOString();
  const packet = {
    packet_version: 'VOS_INTAKE_1.0',
    questionnaire_version: 'RX_CANONICO_1.0',
    scoring_version: 'RX_SCORE_1.0',
    report_version: 'RX_REPORT_1.0',
    source_product: 'RAIO_X_ESTRATEGICO',
    source_system: 'homologacao_preview',
    source_session_id: access.ref,
    client_ref: `HOMOLOGACAO_${Date.now()}`,
    created_at: now,
    score: {
      overall: 50,
      coverage_pct: 75,
      status: 'FINAL',
    },
    route_signal: null,
    route_label: 'A VALIDAR',
    human_validation_required: true,
    responses: [],
    public_observations: [],
    p8: {},
    journey_views: {},
    patrimony: [],
    attention_points: [],
    gaps: [],
    hypotheses: [],
    destination: {},
    limitations: ['Registro sintético de homologação técnica.'],
    provenance: {
      test: true,
      environment: 'production_storage_via_preview_harness',
      generated_at: now,
    },
  };

  let saveResp;
  let save;
  try {
    saveResp = await fetch(PROD_SUPABASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: access.ref, packet }),
    });
    save = await saveResp.json().catch(() => ({}));
  } catch {
    return json(res, 502, {
      ok: false,
      stage: 'supabase_persist',
      access_approved: true,
      ref_suffix: access.ref.slice(-12),
      error: 'supabase_unavailable',
    });
  }

  if (!saveResp.ok || !save?.ok) {
    return json(res, saveResp.status || 500, {
      ok: false,
      stage: 'supabase_persist',
      access_approved: true,
      ref_suffix: access.ref.slice(-12),
      error: save?.error || 'persist_failed',
    });
  }

  return json(res, 200, {
    ok: true,
    stage: 'complete',
    access_type: access.tipo || 'manual',
    ref_suffix: access.ref.slice(-12),
    intake_id: save.intake_id,
    created_at: save.created_at,
    note: 'Registro sintético de homologação criado em produção; pode ser removido após verificação.',
  });
}
