import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PROD = "https://ymnegocios.com.br";
const ORIGINS = new Set([PROD, "http://localhost:3000", "http://localhost:5173"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["ENTRADA", "RAIOX", "MOTOR_VOS", "SOLUCAO", "MARCO", "OUTRO"]);
const STATUSES = new Set(["CONCLUIDA", "EM_ANDAMENTO", "PULADA", "PLANEJADA", "PAUSADA"]);
const SOURCES = new Set(["SOLICITACAO_CLIENTE", "MANUAL"]);

function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : PROD,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}
function reply(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}
const text = (value: unknown, max = 10000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const uuid = (value: unknown) => typeof value === "string" && UUID_RE.test(value);
const dateTime = (value: unknown) => {
  const raw = text(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (origin && !ORIGINS.has(origin)) return reply(403, { ok: false, error: "origin_not_allowed" }, origin);
  if (!["GET", "POST"].includes(req.method)) return reply(405, { ok: false, error: "method_not_allowed" }, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(503, { ok: false, error: "storage_not_configured" }, origin);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user?.email) return reply(401, { ok: false, error: "invalid_session" }, origin);
  const email = user.email.toLowerCase();

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return reply(400, { ok: false, error: "invalid_json" }, origin); }
  }
  const params = new URL(req.url).searchParams;
  const action = text(body.action || params.get("action") || "GET_JOURNEY", 80).toUpperCase();
  let clientId = text(body.client_id || params.get("client_id"), 60);

  const [internalQuery, portalQuery] = await Promise.all([
    sb.from("vos_internal_access").select("role,active").eq("email", email).maybeSingle(),
    sb.from("client_portal_access").select("id,client_id,role,active,auth_user_id,email")
      .eq("active", true).or(`auth_user_id.eq.${user.id},email.ilike.${email}`).order("created_at", { ascending: true }),
  ]);
  if (internalQuery.error || portalQuery.error) return reply(503, { ok: false, error: "access_check_failed" }, origin);
  const internal = internalQuery.data?.active === true;
  const portalAccess = (portalQuery.data || []).filter((row: any) =>
    row.auth_user_id === user.id || (!row.auth_user_id && String(row.email).toLowerCase() === email)
  );

  if (!internal) {
    const scoped = (clientId && portalAccess.find((row: any) => row.client_id === clientId)) || portalAccess[0];
    if (!scoped) return reply(403, { ok: false, error: "client_access_not_found" }, origin);
    clientId = scoped.client_id;
  }
  if (!uuid(clientId)) return reply(400, { ok: false, error: "client_required" }, origin);

  async function getJourney() {
    let query = sb.from("client_journey_steps").select("id,client_id,step_key,step_type,title,description,status,sequence_order,started_at,completed_at,source_type,source_ref_id,visible_to_client,metadata,created_at,updated_at")
      .eq("client_id", clientId).order("sequence_order").order("created_at");
    if (!internal) query = query.eq("visible_to_client", true);
    const result = await query;
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function audit(event: string, metadata: Record<string, unknown>) {
    await sb.from("vos_access_audit").insert({ email, role: internal ? internalQuery.data?.role : "CLIENTE", event, metadata });
  }

  try {
    if (action === "GET_JOURNEY") {
      return reply(200, { ok: true, client_id: clientId, steps: await getJourney(), next_step_mapped: false }, origin);
    }
    if (!internal) return reply(403, { ok: false, error: "internal_access_required" }, origin);

    if (action === "SYNC_JOURNEY") {
      const sync = await sb.rpc("sync_client_journey", { p_client_id: clientId, p_actor: email });
      if (sync.error) throw sync.error;
      await audit("CLIENT_JOURNEY_SYNCED", { client_id: clientId, synced_steps: sync.data });
      return reply(200, { ok: true, client_id: clientId, synced_steps: sync.data, steps: await getJourney() }, origin);
    }

    if (action === "UPSERT_STEP") {
      const id = text(body.id, 60);
      const stepType = text(body.step_type, 40).toUpperCase();
      const status = text(body.status, 40).toUpperCase();
      const sourceType = text(body.source_type, 40).toUpperCase() || "MANUAL";
      const title = text(body.title, 180);
      if ((id && !uuid(id)) || !TYPES.has(stepType) || !STATUSES.has(status) || !SOURCES.has(sourceType) || !title) {
        return reply(400, { ok: false, error: "invalid_step" }, origin);
      }
      const row = {
        client_id: clientId,
        step_key: id ? undefined : `MANUAL_${crypto.randomUUID()}`,
        step_type: stepType,
        title,
        description: text(body.description, 5000) || null,
        status,
        sequence_order: Math.max(0, Math.min(100000, Number(body.sequence_order) || 500)),
        started_at: dateTime(body.started_at),
        completed_at: status === "CONCLUIDA" ? dateTime(body.completed_at) || new Date().toISOString() : null,
        source_type: sourceType,
        visible_to_client: body.visible_to_client !== false,
        updated_by: email,
      };
      let write;
      if (id) {
        const { step_key: _ignored, ...updates } = row;
        write = await sb.from("client_journey_steps").update(updates).eq("id", id).eq("client_id", clientId)
          .in("source_type", ["MANUAL", "SOLICITACAO_CLIENTE"]).select().maybeSingle();
      } else {
        write = await sb.from("client_journey_steps").insert({ ...row, created_by: email }).select().single();
      }
      if (write.error) throw write.error;
      if (!write.data) return reply(404, { ok: false, error: "manual_step_not_found" }, origin);
      await audit("CLIENT_JOURNEY_STEP_SAVED", { client_id: clientId, step_id: write.data.id });
      return reply(200, { ok: true, step: write.data, steps: await getJourney() }, origin);
    }

    if (action === "DELETE_STEP") {
      const id = text(body.id, 60);
      if (!uuid(id)) return reply(400, { ok: false, error: "step_required" }, origin);
      const write = await sb.from("client_journey_steps").delete().eq("id", id).eq("client_id", clientId)
        .in("source_type", ["MANUAL", "SOLICITACAO_CLIENTE"]).select("id").maybeSingle();
      if (write.error) throw write.error;
      if (!write.data) return reply(404, { ok: false, error: "manual_step_not_found" }, origin);
      await audit("CLIENT_JOURNEY_STEP_DELETED", { client_id: clientId, step_id: id });
      return reply(200, { ok: true, steps: await getJourney() }, origin);
    }
    return reply(400, { ok: false, error: "unsupported_action" }, origin);
  } catch (error) {
    console.error("client-journey", action, error);
    return reply(409, { ok: false, error: "journey_action_failed", detail: String((error as Error)?.message || error).slice(0, 500) }, origin);
  }
});
