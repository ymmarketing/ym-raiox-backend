import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STAGING_ORIGIN = "https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const REDIRECT_TO = `${STAGING_ORIGIN}/motor-vos.html`;
const ALLOWED_ORIGINS = new Set([STAGING_ORIGIN, "http://localhost:3000", "http://localhost:5173"]);
const MOTOR_FROM = "YM Marketing & Negócios <acesso@ymnegocios.com.br>";

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
function emailHtml(actionLink: string) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;color:#0d2b45">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#f4f7fb"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe7f0;border-radius:18px;overflow:hidden">
      <tr><td style="padding:26px 32px;background:#0d2b45;color:#fff">
        <div style="font-size:13px;font-weight:800;letter-spacing:.12em">YM MARKETING & NEGÓCIOS</div>
        <div style="font-size:28px;font-weight:800;margin-top:10px">Acesso ao Motor VOS</div>
      </td></tr>
      <tr><td style="padding:32px">
        <div style="font-size:13px;font-weight:800;color:#0866ff;letter-spacing:.08em;margin-bottom:14px">VER · ORDENAR · SUSTENTAR</div>
        <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Olá!</p>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">Use o botão abaixo para entrar na área interna do <strong>Motor VOS</strong>. Este link é pessoal e temporário.</p>
        <p style="margin:0 0 26px"><a href="${actionLink}" style="display:inline-block;background:#0866ff;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px">Entrar no Motor VOS</a></p>
        <p style="font-size:13px;line-height:1.5;color:#61748a;margin:0">Se você não solicitou este acesso, ignore este e-mail. Não compartilhe o link com outras pessoas.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(503, { ok: false, error: "auth_not_configured" }, origin);
  if (!resendApiKey) return reply(503, { ok: false, error: "resend_not_configured" }, origin);

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

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: REDIRECT_TO },
  });
  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    console.error("motor magic link generation failed", linkError?.message || "missing_action_link");
    return reply(503, { ok: false, error: "magic_link_generation_failed" }, origin);
  }

  const resend = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MOTOR_FROM,
      to: [email],
      subject: "Seu acesso ao Motor VOS | YM Marketing & Negócios",
      html: emailHtml(actionLink),
    }),
  });

  if (!resend.ok) {
    const detail = await resend.text();
    console.error("motor resend failed", resend.status, detail.slice(0, 500));
    return reply(503, { ok: false, error: "resend_send_failed" }, origin);
  }

  await admin.from("vos_access_audit").insert({
    email,
    role: access.role,
    event: "MAGIC_LINK_SENT",
    metadata: { redirect_to: REDIRECT_TO, provider: "resend", template: "MOTOR_VOS_ACCESS_1.0" },
  });
  return reply(200, { ok: true, message: "Se o e-mail estiver autorizado, o acesso será enviado." }, origin);
});
