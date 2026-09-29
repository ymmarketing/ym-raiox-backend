import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowed = new Set(["https://ymnegocios.com.br", "https://www.ymnegocios.com.br", "http://localhost:8000", "http://localhost:3000"]);
function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowed.has(origin) ? origin : "https://ymnegocios.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
function reply(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST" || !origin || !allowed.has(origin)) return reply(403, { error: "origin_not_allowed" }, origin);
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 12000) return reply(413, { error: "payload_too_large" }, origin);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 12000) return reply(413, { error: "payload_too_large" }, origin);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json");
  } catch { return reply(400, { error: "invalid_json" }, origin); }
  if (clean(body.website, 100)) return reply(200, { ok: true }, origin); // honeypot
  if (body.consent !== true) return reply(400, { error: "consent_required" }, origin);
  const answers = body.answers;
  const source = body.source;
  if (!answers || typeof answers !== "object" || Array.isArray(answers) ||
    !source || typeof source !== "object" || Array.isArray(source)) return reply(400, { error: "invalid_payload" }, origin);
  const url = Deno.env.get("SUPABASE_URL");
  let key = "";
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { /* local legacy fallback */ }
  key ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return reply(503, { error: "storage_unavailable" }, origin);
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || `email:${clean(body.email, 254).toLowerCase()}`;
  const bytes = new TextEncoder().encode(`${key}:${ip}:${new Date().toISOString().slice(0, 10)}`);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
  try {
    const res = await fetch(`${url}/rest/v1/rpc/ym_submit_triage`, {
      method: "POST",
      headers: { "apikey": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_name: clean(body.name, 150), p_business_name: clean(body.business_name, 200),
        p_email: clean(body.email, 254), p_phone: clean(body.phone, 40),
        p_answers: answers, p_source: source, p_request_key: hash,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const message = String(data?.message || "");
      if (message.includes("rate_limit_exceeded")) return reply(429, { error: "too_many_requests" }, origin);
      if (/invalid_|ambiguous_contact/.test(message)) return reply(400, { error: "invalid_form" }, origin);
      console.error("triage_storage_error", data?.code);
      return reply(503, { error: "storage_unavailable" }, origin);
    }
    return reply(200, { ok: true, id: data.id, score: data.score, route: data.route }, origin);
  } catch (error) {
    console.error("triage_network_error", error instanceof Error ? error.name : "unknown");
    return reply(503, { error: "storage_unavailable" }, origin);
  }
});
