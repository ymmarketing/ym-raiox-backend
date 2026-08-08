import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function reply(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function validUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function claimsFromJwt(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    const email = String(payload.email || "").trim().toLowerCase();
    const sub = String(payload.sub || "").trim();
    if (!email || !sub) return null;
    return { email, sub };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { ok: false }, origin);
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" }, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { ok: false, error: "origin_not_allowed" }, origin);

  const claims = claimsFromJwt(req);
  if (!claims) return reply(401, { ok: false, error: "invalid_session" }, origin);

  let body: any;
  try { body = await req.json(); }
  catch { return reply(400, { ok: false, error: "invalid_json" }, origin); }

  const intakeId = body?.intake_id;
  if (!validUuid(intakeId)) return reply(400, { ok: false, error: "invalid_intake_id" }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(503, { ok: false, error: "storage_not_configured" }, origin);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: access, error: accessError } = await supabase
    .from("vos_internal_access")
    .select("role,active")
    .eq("email", claims.email)
    .maybeSingle();

  if (accessError) return reply(503, { ok: false, error: "access_check_failed" }, origin);
  if (!access || access.active !== true || !["ADMIN", "APLICADOR"].includes(access.role)) {
    await supabase.from("vos_access_audit").insert({
      email: claims.email,
      role: access?.role || null,
      event: "CREATE_CASE_DENIED",
      metadata: { intake_id: intakeId, sub: claims.sub },
    });
    return reply(403, { ok: false, error: "forbidden" }, origin);
  }

  const { data, error } = await supabase.rpc("vos_create_case_from_intake", {
    p_intake_id: intakeId,
    p_created_by: claims.email,
  });

  if (error) {
    console.error("create-vos-case failed", { code: error.code, message: error.message });
    const notFound = /não encontrado/i.test(error.message || "");
    return reply(notFound ? 404 : 500, { ok: false, error: notFound ? "intake_not_found" : "case_create_failed" }, origin);
  }

  await supabase.from("vos_access_audit").insert({
    email: claims.email,
    role: access.role,
    event: "CREATE_CASE_OK",
    metadata: { intake_id: intakeId, case_id: data },
  });

  return reply(201, { ok: true, case_id: data, case_version: "VOS_CASE_1.0", stage: "VER" }, origin);
});
