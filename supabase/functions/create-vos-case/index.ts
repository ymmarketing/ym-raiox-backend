import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function actorFromJwt(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return "AUTHENTICATED_USER";
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return String(payload.email || payload.sub || "AUTHENTICATED_USER").slice(0, 240);
  } catch {
    return "AUTHENTICATED_USER";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

  let body: any;
  try { body = await req.json(); }
  catch { return reply(400, { ok: false, error: "invalid_json" }); }

  const intakeId = body?.intake_id;
  if (!validUuid(intakeId)) return reply(400, { ok: false, error: "invalid_intake_id" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(503, { ok: false, error: "storage_not_configured" });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const actor = actorFromJwt(req);
  const { data, error } = await supabase.rpc("vos_create_case_from_intake", {
    p_intake_id: intakeId,
    p_created_by: actor,
  });

  if (error) {
    console.error("create-vos-case failed", { code: error.code, message: error.message });
    const notFound = /não encontrado/i.test(error.message || "");
    return reply(notFound ? 404 : 500, { ok: false, error: notFound ? "intake_not_found" : "case_create_failed" });
  }

  return reply(201, { ok: true, case_id: data, case_version: "VOS_CASE_1.0", stage: "VER" });
});
