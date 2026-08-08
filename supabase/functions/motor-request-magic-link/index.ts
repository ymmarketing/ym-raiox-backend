import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STAGING_ORIGIN = "https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const REDIRECT_TO = `${STAGING_ORIGIN}/motor-vos.html`;
const ALLOWED_ORIGINS = new Set([STAGING_ORIGIN, "http://localhost:3000", "http://localhost:5173"]);

function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : STAGING_ORIGIN,
    "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
function reply(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}
function validEmail(v: unknown) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 240;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { ok: false }, origin);
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" }, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { ok: false, error: "origin_not_allowed" }, origin);

  let body: any;
  try { body = await req.json(); } catch { return reply(400, { ok: false, error: "invalid_json" }, origin); }
  if (!validEmail(body?.email)) return reply(400, { ok: false, error: "invalid_email" }, origin);
  const email = String(body.email).trim().toLowerCase();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return reply(503, { ok: false, error: "auth_not_configured" }, origin);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: access, error: accessError } = await admin
    .from("vos_internal_access")
    .select("role,active")
    .eq("email", email)
    .maybeSingle();

  if (accessError) return reply(503, { ok: false, error: "access_check_failed" }, origin);
  if (!access || access.active !== true) {
    await admin.from("vos_access_audit").insert({ email, role: access?.role || null, event: "MAGIC_LINK_DENIED" });
    return reply(200, { ok: true, message: "Se o e-mail estiver autorizado, o acesso será enviado." }, origin);
  }

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already|registered|exists/i.test(created.error.message || "")) {
    console.error("motor auth provision failed", created.error.message);
    return reply(503, { ok: false, error: "auth_provision_failed" }, origin);
  }

  const publicClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: otpError } = await publicClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: REDIRECT_TO },
  });
  if (otpError) {
    console.error("motor magic link failed", otpError.message);
    return reply(503, { ok: false, error: "magic_link_failed" }, origin);
  }

  await admin.from("vos_access_audit").insert({ email, role: access.role, event: "MAGIC_LINK_SENT", metadata: { redirect_to: REDIRECT_TO } });
  return reply(200, { ok: true, message: "Se o e-mail estiver autorizado, o acesso será enviado." }, origin);
});
