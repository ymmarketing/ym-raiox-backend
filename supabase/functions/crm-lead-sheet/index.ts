import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PROD = "https://ymnegocios.com.br";
const ORIGINS = new Set([
  PROD,
  "https://ym-raiox-backend.vercel.app",
  "https://ym-raiox-backend-ym-marketing-negocios.vercel.app",
  "https://ym-raiox-backend-git-main-ym-marketing-negocios.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173"
]);

function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : PROD,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}

function reply(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function emailFromJwt(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)));
    return parsed.email ? String(parsed.email).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function uuid(v: unknown) {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
}

function httpOrBlank(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return !s || /^https?:\/\//i.test(s);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (origin && !ORIGINS.has(origin)) return reply(403, { ok: false, error: "origin_not_allowed" }, origin);
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" }, origin);

  const email = emailFromJwt(req);
  if (!email) return reply(401, { ok: false, error: "invalid_session" }, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(503, { ok: false, error: "storage_not_configured" }, origin);

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: access, error: accessError } = await sb
    .from("vos_internal_access")
    .select("role,active")
    .eq("email", email)
    .maybeSingle();

  if (accessError || !access?.active) return reply(403, { ok: false, error: "forbidden" }, origin);
  if (!["ADMIN", "APLICADOR"].includes(access.role)) return reply(403, { ok: false, error: "write_forbidden" }, origin);

  let body: any;
  try { body = await req.json(); } catch { return reply(400, { ok: false, error: "invalid_json" }, origin); }

  if (!uuid(body?.opportunity_id)) return reply(400, { ok: false, error: "invalid_opportunity_id" }, origin);
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  for (const field of ["website_url", "instagram_url", "linkedin_url", "google_url", "other_url", "initial_reading_url"]) {
    if (!httpOrBlank(payload[field])) return reply(400, { ok: false, error: `${field}_must_be_http` }, origin);
  }

  const { data, error } = await sb.rpc("crm_save_lead_sheet", {
    p_opportunity_id: body.opportunity_id,
    p_payload: payload,
    p_actor: email
  });

  if (error) return reply(409, { ok: false, error: "lead_sheet_save_rejected", detail: error.message }, origin);

  await sb.from("vos_access_audit").insert({
    email,
    role: access.role,
    event: "CRM_LEAD_SHEET_SAVE",
    metadata: { opportunity_id: body.opportunity_id, status: payload.current_stage || null }
  });

  return reply(200, { ok: true, result: data }, origin);
});
