import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PROD_ORIGIN = "https://ymnegocios.com.br";
const ALLOWED = new Set([PROD_ORIGIN, "http://localhost:3000", "http://localhost:5173"]);

function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED.has(origin) ? origin : PROD_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function reply(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

const monthKey = (value: unknown) => {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-01$/.test(raw)) return raw;
  return null;
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED.has(origin)) return reply(403, { ok: false }, origin);
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (!["GET", "POST"].includes(req.method)) return reply(405, { ok: false, error: "method_not_allowed" }, origin);
  if (origin && !ALLOWED.has(origin)) return reply(403, { ok: false, error: "origin_not_allowed" }, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(503, { ok: false, error: "storage_not_configured" }, origin);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user?.email) return reply(401, { ok: false, error: "invalid_session" }, origin);
  const identity = { email: user.email.toLowerCase(), sub: user.id };
  const { data: access, error: accessError } = await sb.from("vos_internal_access")
    .select("role,active").eq("email", identity.email).maybeSingle();
  if (accessError) return reply(503, { ok: false, error: "access_check_failed" }, origin);
  if (!access || access.active !== true) return reply(403, { ok: false, error: "forbidden" }, origin);

  if (req.method === "POST") {
    if (access.role !== "ADMIN") return reply(403, { ok: false, error: "admin_required" }, origin);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { return reply(400, { ok: false, error: "invalid_json" }, origin); }
    const effectiveMonth = monthKey(body.effective_month);
    const target = body.monthly_revenue_target === "" || body.monthly_revenue_target == null
      ? Number.NaN
      : Number(body.monthly_revenue_target);
    const note = String(body.note || "Meta financeira atualizada na aba Financeiro").trim().slice(0, 1000);
    if (!effectiveMonth) return reply(400, { ok: false, error: "invalid_effective_month" }, origin);
    if (!Number.isFinite(target) || target < 0) return reply(400, { ok: false, error: "invalid_monthly_revenue_target" }, origin);

    const write = await sb.from("finance_target_history").upsert({
      effective_month: effectiveMonth,
      monthly_revenue_target: target,
      changed_at: new Date().toISOString(),
      changed_by: identity.email,
      note: note || null,
    }, { onConflict: "effective_month" }).select().single();
    if (write.error) return reply(500, { ok: false, error: "target_write_failed", detail: write.error.message }, origin);

    // Compatibilidade: consumidores antigos continuam lendo MONTHLY_REVENUE_TARGET.
    const nowMonth = currentMonth();
    const latest = await sb.from("finance_target_history")
      .select("effective_month,monthly_revenue_target")
      .lte("effective_month", nowMonth)
      .order("effective_month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) return reply(500, { ok: false, error: "target_resolution_failed", detail: latest.error.message }, origin);
    if (latest.data) {
      const previous = await sb.from("finance_assumptions")
        .select("numeric_value").eq("assumption_key", "MONTHLY_REVENUE_TARGET").maybeSingle();
      const compatibility = await sb.from("finance_assumptions").update({
        numeric_value: latest.data.monthly_revenue_target,
        updated_at: new Date().toISOString(),
        updated_by: identity.email,
        source_note: "Sincronizado com o histórico mensal de metas",
      }).eq("assumption_key", "MONTHLY_REVENUE_TARGET");
      if (compatibility.error) return reply(500, { ok: false, error: "legacy_target_sync_failed", detail: compatibility.error.message }, origin);
      if (Number(previous.data?.numeric_value) !== Number(latest.data.monthly_revenue_target)) {
        await sb.from("finance_assumption_history").insert({
          assumption_key: "MONTHLY_REVENUE_TARGET",
          changed_by: identity.email,
          previous_value: previous.data?.numeric_value ?? null,
          new_value: latest.data.monthly_revenue_target,
          change_reason: `Meta vigente desde ${latest.data.effective_month}`,
        });
      }
    }
    await sb.from("vos_access_audit").insert({
      email: identity.email,
      role: access.role,
      event: "FINANCE_TARGET_CHANGED",
    });
  }

  const { data, error } = await sb.from("finance_target_history")
    .select("effective_month,monthly_revenue_target,changed_at,changed_by,note")
    .order("effective_month");
  if (error) return reply(500, { ok: false, error: "target_history_read_failed", detail: error.message }, origin);
  return reply(200, { ok: true, target_history: data || [] }, origin);
});
