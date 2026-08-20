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
  report_version: "RX_REPORT_1.1",
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
  if (packet.interpretation && packet.interpretation.report_version !== "RX_REPORT_1.1") return false;
  return true;
}

function responseValue(packet: any, id: string): string | null {
  const r = Array.isArray(packet?.responses)
    ? packet.responses.find((x: any) => x?.question_id === id)
    : null;
  if (!r || r.value == null) return null;
  const v = String(r.value).trim();
  return v || null;
}

function firstUrl(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s,;]+/i);
  return m ? m[0] : null;
}

async function ensureConnectedJourney(supabase: any, intakeId: string, packet: any) {
  const { data: caseId, error: caseErr } = await supabase.rpc("vos_create_case_from_intake", {
    p_intake_id: intakeId,
    p_created_by: "SYSTEM_RAIOX",
  });
  if (caseErr || !caseId) throw new Error(`case_create:${caseErr?.message || "sem_id"}`);

  const clientName = responseValue(packet, "RX01");
  const businessName = responseValue(packet, "RX02") || packet.client_ref || "Cliente Raio-X";
  const segment = responseValue(packet, "RX03");
  const cityState = responseValue(packet, "RX04");
  const links = responseValue(packet, "RX06");
  const website = firstUrl(links);
  const rxPayload = {
    latest_raiox: {
      intake_id: intakeId,
      case_id: caseId,
      score: packet?.score?.overall ?? null,
      coverage_pct: packet?.score?.coverage_pct ?? null,
      report_version: packet?.report_version ?? null,
      received_at: new Date().toISOString(),
    },
  };

  let contact: any = null;
  if (clientName && businessName) {
    const q = await supabase
      .from("crm_contacts")
      .select("id,source_payload,segment,city_state,website_url")
      .eq("name", clientName)
      .eq("business_name", businessName)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`crm_contact_lookup:${q.error.message}`);
    contact = q.data;
  }

  if (!contact) {
    const ins = await supabase
      .from("crm_contacts")
      .insert({
        client_ref: `RX-${intakeId}`,
        external_key: `raiox:${intakeId}`,
        name: clientName,
        business_name: businessName,
        source: "RAIO_X_PAGO",
        segment,
        city_state: cityState,
        website_url: website,
        notes: "Contato criado automaticamente após entrega do Raio-X Estratégico.",
        source_payload: rxPayload,
        active: true,
      })
      .select("id,source_payload")
      .single();
    if (ins.error || !ins.data) throw new Error(`crm_contact_create:${ins.error?.message || "sem_id"}`);
    contact = ins.data;
  } else {
    const mergedPayload = {
      ...(contact.source_payload && typeof contact.source_payload === "object" ? contact.source_payload : {}),
      ...rxPayload,
    };
    const upd: any = { source_payload: mergedPayload, updated_at: new Date().toISOString() };
    if (!contact.segment && segment) upd.segment = segment;
    if (!contact.city_state && cityState) upd.city_state = cityState;
    if (!contact.website_url && website) upd.website_url = website;
    const u = await supabase.from("crm_contacts").update(upd).eq("id", contact.id);
    if (u.error) throw new Error(`crm_contact_update:${u.error.message}`);
  }

  let opportunity: any = null;
  const existingOpp = await supabase
    .from("crm_opportunities")
    .select("id")
    .eq("source_intake_id", intakeId)
    .limit(1)
    .maybeSingle();
  if (existingOpp.error) throw new Error(`crm_opportunity_lookup:${existingOpp.error.message}`);
  opportunity = existingOpp.data;

  if (!opportunity) {
    const insOpp = await supabase
      .from("crm_opportunities")
      .insert({
        contact_id: contact.id,
        current_stage: "RAIOX_ENTREGUE",
        source_intake_id: intakeId,
        source_case_id: caseId,
        recommended_route: null,
        route_rationale: null,
        next_action: "Validar as hipóteses do Raio-X no Motor VOS e concluir o VER antes de definir a rota.",
        notes: "Raio-X RX_REPORT_1.1 conectado automaticamente. Hipóteses entram como sugestões e exigem validação humana.",
      })
      .select("id")
      .single();
    if (insOpp.error || !insOpp.data) throw new Error(`crm_opportunity_create:${insOpp.error?.message || "sem_id"}`);
    opportunity = insOpp.data;
  }

  return { case_id: caseId, contact_id: contact.id, opportunity_id: opportunity.id };
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

  const existing = await supabase
    .from("raiox_intakes")
    .select("id,created_at,packet")
    .eq("source_session_id", canonicalPacket.source_session_id)
    .limit(1)
    .maybeSingle();
  if (existing.error) return reply(500, { ok: false, error: "storage_lookup_error" }, origin);
  if (existing.data) {
    try {
      const linked = await ensureConnectedJourney(supabase, existing.data.id, existing.data.packet || canonicalPacket);
      return reply(200, { ok: true, intake_id: existing.data.id, created_at: existing.data.created_at, ...linked, idempotent: true }, origin);
    } catch (e) {
      console.error("save-raiox-intake reconnect failed", String(e));
      return reply(500, { ok: false, error: "journey_connection_error" }, origin);
    }
  }

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

  try {
    const linked = await ensureConnectedJourney(supabase, data.id, canonicalPacket);
    return reply(201, { ok: true, intake_id: data.id, created_at: data.created_at, ...linked }, origin);
  } catch (e) {
    console.error("save-raiox-intake journey connection failed", String(e));
    return reply(500, { ok: false, error: "journey_connection_error", intake_id: data.id }, origin);
  }
});
