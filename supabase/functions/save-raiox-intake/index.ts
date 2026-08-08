import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PAYMENT_STATUS_URL = "https://ym-raiox-backend.vercel.app/api/pagamento/status";
const ALLOWED_ORIGINS = new Set([
  "https://ymnegocios.com.br",
  "https://www.ymnegocios.com.br",
]);

const EXPECTED = Object.freeze({
  packet_version: "VOS_INTAKE_1.0",
  questionnaire_version: "RX_CANONICO_1.0",
  scoring_version: "RX_SCORE_1.0",
  report_version: "RX_REPORT_1.0",
});

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ymnegocios.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function reply(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function validRef(ref: unknown): ref is string {
  return typeof ref === "string" && /^ym_raiox_[a-zA-Z0-9_-]{8,160}$/.test(ref);
}

function packetValido(packet: any) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return false;
  if (packet.packet_version !== EXPECTED.packet_version) return false;
  if (packet.questionnaire_version !== EXPECTED.questionnaire_version) return false;
  if (packet.scoring_version !== EXPECTED.scoring_version) return false;
  if (packet.report_version !== EXPECTED.report_version) return false;
  if (packet.source_product !== "RAIO_X_ESTRATEGICO") return false;
  if (packet.human_validation_required !== true) return false;
  if (packet.route_signal !== null) return false;
  if (!packet.score || !["FINAL", "DADOS_INSUFICIENTES"].includes(packet.score.status)) return false;
  const cov = Number(packet.score.coverage_pct);
  if (!Number.isFinite(cov) || cov < 0 || cov > 100) return false;
  if (packet.score.overall !== null) {
    const overall = Number(packet.score.overall);
    if (!Number.isFinite(overall) || overall < 0 || overall > 100) return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { ok: false }, origin);
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" }, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { ok: false, error: "origin_not_allowed" }, origin);

  let body: any;
  try { body = await req.json(); }
  catch { return reply(400, { ok: false, error: "invalid_json" }, origin); }

  const ref = body?.ref;
  const packet = body?.packet;
  if (!validRef(ref)) return reply(400, { ok: false, error: "invalid_ref" }, origin);
  if (!packetValido(packet)) return reply(400, { ok: false, error: "invalid_packet" }, origin);

  let statusPayload: any;
  try {
    const r = await fetch(`${PAYMENT_STATUS_URL}?ref=${encodeURIComponent(ref)}`, { headers: { "Cache-Control": "no-store" } });
    if (!r.ok) return reply(503, { ok: false, error: "payment_status_unavailable" }, origin);
    statusPayload = await r.json();
  } catch {
    return reply(503, { ok: false, error: "payment_status_unavailable" }, origin);
  }
  if (statusPayload?.status !== "approved") return reply(403, { ok: false, error: "payment_not_approved" }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(503, { ok: false, error: "storage_not_configured" }, origin);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { _score_full: _discard, ...canonicalPacket } = packet;
  canonicalPacket.source_session_id = canonicalPacket.source_session_id || ref;

  const row = {
    source_product: canonicalPacket.source_product,
    source_system: canonicalPacket.source_system || "ym_raiox_oficial",
    source_session_id: canonicalPacket.source_session_id,
    client_ref: canonicalPacket.client_ref || null,
    packet_version: canonicalPacket.packet_version,
    questionnaire_version: canonicalPacket.questionnaire_version,
    scoring_version: canonicalPacket.scoring_version,
    report_version: canonicalPacket.report_version,
    score_overall: canonicalPacket.score.overall,
    score_coverage_pct: canonicalPacket.score.coverage_pct,
    score_status: canonicalPacket.score.status,
    route_signal: null,
    human_validation_required: true,
    packet: canonicalPacket,
  };

  const { data, error } = await supabase
    .from("raiox_intakes")
    .insert(row)
    .select("id,created_at")
    .single();

  if (error) {
    console.error("save-raiox-intake insert failed", { code: error.code, message: error.message });
    return reply(500, { ok: false, error: "storage_error" }, origin);
  }

  return reply(201, { ok: true, intake_id: data.id, created_at: data.created_at }, origin);
});
