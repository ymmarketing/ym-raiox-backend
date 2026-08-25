import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PROD = "https://ymnegocios.com.br";
const ORIGINS = new Set([PROD, "http://localhost:3000", "http://localhost:5173"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KPI_UNITS = new Set(["NUMERO", "MOEDA", "PERCENTUAL", "TEMPO_MINUTOS", "QUANTIDADE", "NOTA", "BOOLEANO", "INDICE"]);
const KPI_DIRECTIONS = new Set(["MAIOR_MELHOR", "MENOR_MELHOR", "FAIXA_IDEAL"]);
const KPI_CATEGORIES = new Set(["NEGOCIO", "COMERCIAL", "MARKETING", "CONTEUDO", "SITE", "REDES_SOCIAIS", "ATENDIMENTO", "FINANCEIRO", "OPERACAO", "OUTRO"]);
const ACTION_TYPES = new Set(["CONTEUDO", "BIO_PERFIL", "HOME_SITE", "SITE", "CTA", "FUNIL", "CRM", "AUTOMACAO", "OFERTA", "CAMPANHA", "MIDIA_PAGA", "TREINAMENTO", "PROCESSO", "ATENDIMENTO", "OUTRO"]);

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
const numberOrNull = (value: unknown) => value === "" || value == null ? null : Number(value);
const dateOnly = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 20)) ? text(value, 20) : null;
const code = (value: unknown) => text(value, 100).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

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
  const access = await sb.from("vos_internal_access").select("role,active").eq("email", email).maybeSingle();
  if (access.error) return reply(503, { ok: false, error: "access_check_failed" }, origin);
  if (!access.data || access.data.active !== true) return reply(403, { ok: false, error: "forbidden" }, origin);

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return reply(400, { ok: false, error: "invalid_json" }, origin); }
  }
  const params = new URL(req.url).searchParams;
  const action = text(body.action || params.get("action") || (req.method === "GET" ? "OVERVIEW" : ""), 80).toUpperCase();
  const clientId = text(body.client_id || params.get("client_id"), 60);

  async function clientExists(id: string) {
    const q = await sb.from("crm_clients").select("id").eq("id", id).maybeSingle();
    if (q.error) throw q.error;
    return !!q.data;
  }
  async function audit(event: string, metadata: Record<string, unknown>) {
    await sb.from("vos_access_audit").insert({ email, role: access.data.role, event, metadata });
  }
  async function bundle(id: string) {
    if (!uuid(id) || !(await clientExists(id))) throw new Error("client_not_found");
    const [client, kpis, measures, actions, actionKpis, contents, contentMetrics, sources] = await Promise.all([
      sb.from("crm_clients").select("id,status,became_client_at,contact:crm_contacts(name,business_name,email,segment)").eq("id", id).single(),
      sb.from("client_performance_kpis").select("*").eq("client_id", id).eq("active", true).order("category").order("name"),
      sb.from("client_performance_measurements").select("*").eq("client_id", id).neq("validation_status", "DESCARTADO").order("period_start"),
      sb.from("client_performance_actions").select("*").eq("client_id", id).order("action_date", { ascending: false }),
      sb.from("client_performance_action_kpis").select("*"),
      sb.from("central_ym_content_items").select("id,title_internal,client_title,primary_channel,format,status,publish_date,published_url").eq("client_id", id).order("publish_date", { ascending: false }),
      sb.from("central_ym_content_performance").select("*").eq("client_id", id).order("created_at"),
      sb.from("performance_data_sources").select("id,provider,name,external_project_id,status,config,last_synced_at,next_sync_at,last_error,created_at,updated_at").eq("client_id", id).order("provider"),
    ]);
    const failed = [client, kpis, measures, actions, actionKpis, contents, contentMetrics, sources].find((q: any) => q.error);
    if (failed?.error) throw failed.error;
    const kpiIds = new Set((kpis.data || []).map((x: any) => x.id));
    const actionIds = new Set((actions.data || []).map((x: any) => x.id));
    return {
      client: client.data,
      kpis: kpis.data || [],
      measurements: measures.data || [],
      actions: (actions.data || []).map((x: any) => ({
        ...x,
        kpi_links: (actionKpis.data || []).filter((l: any) => l.action_id === x.id && kpiIds.has(l.kpi_id)),
      })),
      contents: contents.data || [],
      content_metrics: contentMetrics.data || [],
      sources: sources.data || [],
      integration_readiness: {
        reportei: {
          status: (sources.data || []).find((x: any) => x.provider === "REPORTEI")?.status || "PLANEJADO",
          credentials_stored_in_database: false,
        },
      },
    };
  }

  try {
    if (action === "OVERVIEW") {
      const [clients, kpis, actions, measurements] = await Promise.all([
        sb.from("crm_clients").select("id,status,became_client_at,contact:crm_contacts(name,business_name,email,segment)").order("became_client_at", { ascending: false }),
        sb.from("client_performance_kpis").select("id,client_id,target_value,baseline_value,direction,ideal_min_value,ideal_max_value,active").eq("active", true),
        sb.from("client_performance_actions").select("id,client_id,status,action_date"),
        sb.from("client_performance_measurements").select("id,client_id,kpi_id,value,period_start,validation_status").neq("validation_status", "DESCARTADO"),
      ]);
      const failed = [clients, kpis, actions, measurements].find((q: any) => q.error);
      if (failed?.error) throw failed.error;
      const rows = (clients.data || []).map((client: any) => {
        const ck = (kpis.data || []).filter((k: any) => k.client_id === client.id);
        const cm = (measurements.data || []).filter((m: any) => m.client_id === client.id);
        const latestByKpi = new Map<string, any>();
        for (const m of cm) {
          const previous = latestByKpi.get(m.kpi_id);
          if (!previous || String(previous.period_start) < String(m.period_start)) latestByKpi.set(m.kpi_id, m);
        }
        const measured = ck.filter((k: any) => latestByKpi.has(k.id)).length;
        const onTarget = ck.filter((k: any) => {
          const m = latestByKpi.get(k.id);
          if (!m || k.target_value == null) return false;
          if (k.direction === "MENOR_MELHOR") return Number(m.value) <= Number(k.target_value);
          if (k.direction === "FAIXA_IDEAL") {
            return k.ideal_min_value != null && k.ideal_max_value != null
              && Number(m.value) >= Number(k.ideal_min_value)
              && Number(m.value) <= Number(k.ideal_max_value);
          }
          return Number(m.value) >= Number(k.target_value);
        }).length;
        const withEvolution = ck.map((k: any) => {
          const latest = latestByKpi.get(k.id);
          if (!latest || k.baseline_value == null) return null;
          const delta = Number(latest.value) - Number(k.baseline_value);
          const improved = k.direction === "MENOR_MELHOR" ? delta < 0 : delta > 0;
          const worsened = k.direction === "MENOR_MELHOR" ? delta > 0 : delta < 0;
          return improved ? 1 : worsened ? -1 : 0;
        }).filter((x: number | null) => x != null);
        const evolutionScore = withEvolution.reduce((sum: number, value: number) => sum + value, 0);
        return {
          ...client,
          kpis_total: ck.length,
          kpis_measured: measured,
          kpis_on_target: onTarget,
          evolution_status: !withEvolution.length ? "SEM_DADOS" : evolutionScore > 0 ? "CRESCENDO" : evolutionScore < 0 ? "QUEDA" : "ESTAVEL",
          actions_total: (actions.data || []).filter((a: any) => a.client_id === client.id).length,
        };
      });
      return reply(200, { ok: true, clients: rows }, origin);
    }

    if (action === "GET_CLIENT") return reply(200, { ok: true, data: await bundle(clientId) }, origin);

    if (action === "GET_CONTENT") {
      const contentId = text(body.content_id || params.get("content_id"), 60);
      if (!uuid(contentId)) return reply(400, { ok: false, error: "content_required" }, origin);
      const [content, metrics] = await Promise.all([
        sb.from("central_ym_content_items").select("*").eq("id", contentId).maybeSingle(),
        sb.from("central_ym_content_performance").select("*").eq("content_id", contentId).order("created_at"),
      ]);
      if (content.error || metrics.error) throw content.error || metrics.error;
      if (!content.data) return reply(404, { ok: false, error: "content_not_found" }, origin);
      let strategy = null;
      if (content.data.client_id) {
        const strategyQuery = await sb.from("client_content_strategies").select("*").eq("client_id", content.data.client_id).eq("status", "ACTIVE").order("effective_date", { ascending: false }).limit(1).maybeSingle();
        if (strategyQuery.error) throw strategyQuery.error;
        strategy = strategyQuery.data;
      }
      return reply(200, { ok: true, content: content.data, metrics: metrics.data || [], strategy }, origin);
    }

    if (action === "UPDATE_CONTENT_CONTEXT") {
      const contentId = text(body.content_id, 60);
      if (!uuid(contentId)) return reply(400, { ok: false, error: "content_required" }, origin);
      const promptContext = body.prompt_context && typeof body.prompt_context === "object" && !Array.isArray(body.prompt_context)
        ? body.prompt_context
        : {};
      const write = await sb.from("central_ym_content_items").update({
        content_objective: text(body.content_objective, 5000),
        prompt_context: promptContext,
        prompt_generated_at: body.prompt_generated === true ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", contentId).select().single();
      if (write.error) throw write.error;
      await audit("CONTENT_CONTEXT_UPDATE", { content_id: contentId, prompt_generated: body.prompt_generated === true });
      return reply(200, { ok: true, content: write.data }, origin);
    }

    if (action === "UPSERT_KPI") {
      if (!uuid(clientId) || !(await clientExists(clientId))) return reply(404, { ok: false, error: "client_not_found" }, origin);
      const name = text(body.name, 300);
      const kpiCode = code(body.code || name);
      const unit = text(body.unit, 40).toUpperCase() || "NUMERO";
      const direction = text(body.direction, 40).toUpperCase() || "MAIOR_MELHOR";
      const category = text(body.category, 40).toUpperCase() || "NEGOCIO";
      const baseline = numberOrNull(body.baseline_value);
      const target = numberOrNull(body.target_value);
      if (!name || !kpiCode) return reply(400, { ok: false, error: "name_required" }, origin);
      if (!KPI_UNITS.has(unit) || !KPI_DIRECTIONS.has(direction) || !KPI_CATEGORIES.has(category)) return reply(400, { ok: false, error: "invalid_kpi_configuration" }, origin);
      if ((baseline != null && !Number.isFinite(baseline)) || (target != null && !Number.isFinite(target))) return reply(400, { ok: false, error: "invalid_kpi_value" }, origin);
      const row = {
        client_id: clientId,
        source_vos_case_id: uuid(body.source_vos_case_id) ? body.source_vos_case_id : null,
        code: kpiCode,
        name,
        description: text(body.description, 3000) || null,
        category,
        unit,
        direction,
        periodicity: text(body.periodicity, 40).toUpperCase() || "MENSAL",
        aggregation: text(body.aggregation, 40).toUpperCase() || "ULTIMO_VALOR",
        baseline_value: baseline,
        baseline_period_start: dateOnly(body.baseline_period_start),
        baseline_period_end: dateOnly(body.baseline_period_end),
        target_value: target,
        target_period_start: dateOnly(body.target_period_start),
        target_period_end: dateOnly(body.target_period_end),
        ideal_min_value: numberOrNull(body.ideal_min_value),
        ideal_max_value: numberOrNull(body.ideal_max_value),
        source_type: text(body.source_type, 40).toUpperCase() || "MANUAL",
        external_metric_key: text(body.external_metric_key, 300) || null,
        visible_to_client: body.visible_to_client !== false,
        active: body.active !== false,
        notes: text(body.notes, 5000) || null,
        updated_at: new Date().toISOString(),
        updated_by: email,
      };
      let query;
      if (uuid(body.id)) query = sb.from("client_performance_kpis").update(row).eq("id", body.id).eq("client_id", clientId);
      else query = sb.from("client_performance_kpis").upsert({ ...row, created_by: email }, { onConflict: "client_id,code" });
      const write = await query.select().single();
      if (write.error) throw write.error;
      if (baseline != null && row.baseline_period_start && row.baseline_period_end) {
        const existing = await sb.from("client_performance_measurements").select("id").eq("kpi_id", write.data.id).eq("is_baseline", true).maybeSingle();
        const baselineRow = {
          kpi_id: write.data.id,
          client_id: clientId,
          source_vos_case_id: row.source_vos_case_id,
          period_start: row.baseline_period_start,
          period_end: row.baseline_period_end,
          value: baseline,
          source_type: row.source_type,
          is_baseline: true,
          validation_status: "VALIDADO",
          notes: "Baseline cadastrado na definição do KPI",
          updated_at: new Date().toISOString(),
          updated_by: email,
        };
        const baselineWrite = existing.data
          ? await sb.from("client_performance_measurements").update(baselineRow).eq("id", existing.data.id)
          : await sb.from("client_performance_measurements").insert({ ...baselineRow, created_by: email });
        if (baselineWrite.error) throw baselineWrite.error;
      }
      await audit("PERFORMANCE_KPI_UPSERT", { client_id: clientId, kpi_id: write.data.id });
      return reply(200, { ok: true, kpi: write.data }, origin);
    }

    if (action === "UPSERT_MEASUREMENT") {
      if (!uuid(clientId) || !uuid(body.kpi_id)) return reply(400, { ok: false, error: "client_and_kpi_required" }, origin);
      const kpi = await sb.from("client_performance_kpis").select("id").eq("id", body.kpi_id).eq("client_id", clientId).maybeSingle();
      if (kpi.error) throw kpi.error;
      if (!kpi.data) return reply(404, { ok: false, error: "kpi_not_found" }, origin);
      const value = body.value === "" || body.value == null ? Number.NaN : Number(body.value);
      const start = dateOnly(body.period_start);
      const end = dateOnly(body.period_end) || start;
      if (!Number.isFinite(value) || !start || !end || end < start) return reply(400, { ok: false, error: "invalid_measurement" }, origin);
      const row = {
        kpi_id: body.kpi_id,
        client_id: clientId,
        source_vos_case_id: uuid(body.source_vos_case_id) ? body.source_vos_case_id : null,
        period_start: start,
        period_end: end,
        value,
        source_type: text(body.source_type, 40).toUpperCase() || "MANUAL",
        source_ref: text(body.source_ref, 1000) || null,
        evidence_url: text(body.evidence_url, 2000) || null,
        is_baseline: !!body.is_baseline,
        validation_status: text(body.validation_status, 40).toUpperCase() || "VALIDADO",
        notes: text(body.notes, 5000) || null,
        updated_at: new Date().toISOString(),
        updated_by: email,
      };
      const write = uuid(body.id)
        ? await sb.from("client_performance_measurements").update(row).eq("id", body.id).eq("client_id", clientId).select().single()
        : await sb.from("client_performance_measurements").insert({ ...row, created_by: email }).select().single();
      if (write.error) throw write.error;
      await audit("PERFORMANCE_MEASUREMENT_UPSERT", { client_id: clientId, kpi_id: body.kpi_id, measurement_id: write.data.id });
      return reply(200, { ok: true, measurement: write.data }, origin);
    }

    if (action === "UPSERT_ACTION") {
      if (!uuid(clientId) || !(await clientExists(clientId))) return reply(404, { ok: false, error: "client_not_found" }, origin);
      const title = text(body.title, 500);
      const actionDate = dateOnly(body.action_date);
      const actionType = text(body.action_type, 40).toUpperCase() || "OUTRO";
      if (!title || !actionDate || !ACTION_TYPES.has(actionType)) return reply(400, { ok: false, error: "invalid_action" }, origin);
      const row = {
        client_id: clientId,
        source_vos_case_id: uuid(body.source_vos_case_id) ? body.source_vos_case_id : null,
        content_id: uuid(body.content_id) ? body.content_id : null,
        client_service_id: uuid(body.client_service_id) ? body.client_service_id : null,
        action_type: actionType,
        title,
        description: text(body.description, 6000) || null,
        hypothesis: text(body.hypothesis, 6000) || null,
        action_date: actionDate,
        status: text(body.status, 40).toUpperCase() || "IMPLEMENTADA",
        expected_lag_days: Math.max(0, Math.round(Number(body.expected_lag_days) || 0)),
        evidence_url: text(body.evidence_url, 2000) || null,
        source_ref: text(body.source_ref, 1000) || null,
        visible_to_client: body.visible_to_client !== false,
        notes: text(body.notes, 5000) || null,
        updated_at: new Date().toISOString(),
        updated_by: email,
      };
      const write = uuid(body.id)
        ? await sb.from("client_performance_actions").update(row).eq("id", body.id).eq("client_id", clientId).select().single()
        : await sb.from("client_performance_actions").insert({ ...row, created_by: email }).select().single();
      if (write.error) throw write.error;
      const kpiIds = Array.isArray(body.kpi_ids) ? body.kpi_ids.filter(uuid) : [];
      const del = await sb.from("client_performance_action_kpis").delete().eq("action_id", write.data.id);
      if (del.error) throw del.error;
      if (kpiIds.length) {
        const allowed = await sb.from("client_performance_kpis").select("id").eq("client_id", clientId).in("id", kpiIds);
        if (allowed.error) throw allowed.error;
        const rows = (allowed.data || []).map((k: any) => ({
          action_id: write.data.id,
          kpi_id: k.id,
          expected_effect: text(body.expected_effect, 40).toUpperCase() || "AUMENTAR",
          attribution_window_days: Math.max(1, Math.round(Number(body.attribution_window_days) || 30)),
        }));
        if (rows.length) {
          const links = await sb.from("client_performance_action_kpis").insert(rows);
          if (links.error) throw links.error;
        }
      }
      await audit("PERFORMANCE_ACTION_UPSERT", { client_id: clientId, action_id: write.data.id, kpi_count: kpiIds.length });
      return reply(200, { ok: true, performance_action: write.data }, origin);
    }

    if (action === "UPSERT_CONTENT_METRIC") {
      const contentId = text(body.content_id, 60);
      if (!uuid(contentId)) return reply(400, { ok: false, error: "content_required" }, origin);
      const content = await sb.from("central_ym_content_items").select("id,client_id").eq("id", contentId).maybeSingle();
      if (content.error) throw content.error;
      if (!content.data) return reply(404, { ok: false, error: "content_not_found" }, origin);
      const metricLabel = text(body.metric_label, 300);
      const metricCode = code(body.metric_code || metricLabel);
      const target = body.target_value === "" || body.target_value == null ? Number.NaN : Number(body.target_value);
      if (!metricLabel || !metricCode || !Number.isFinite(target)) return reply(400, { ok: false, error: "invalid_content_metric" }, origin);
      const row = {
        content_id: contentId,
        client_id: content.data.client_id,
        metric_code: metricCode,
        metric_label: metricLabel,
        unit: text(body.unit, 40).toUpperCase() || "NUMERO",
        direction: text(body.direction, 40).toUpperCase() || "MAIOR_MELHOR",
        baseline_value: numberOrNull(body.baseline_value),
        target_value: target,
        result_value: numberOrNull(body.result_value),
        measurement_start: dateOnly(body.measurement_start),
        measurement_end: dateOnly(body.measurement_end),
        source_type: text(body.source_type, 40).toUpperCase() || "MANUAL",
        external_metric_key: text(body.external_metric_key, 300) || null,
        source_ref: text(body.source_ref, 1000) || null,
        visible_to_client: body.visible_to_client !== false,
        notes: text(body.notes, 3000) || null,
        updated_at: new Date().toISOString(),
        updated_by: email,
      };
      const write = await sb.from("central_ym_content_performance").upsert({ ...row, created_by: email }, { onConflict: "content_id,metric_code" }).select().single();
      if (write.error) throw write.error;
      await audit("CONTENT_PERFORMANCE_METRIC_UPSERT", { content_id: contentId, metric_id: write.data.id });
      return reply(200, { ok: true, metric: write.data }, origin);
    }

    return reply(400, { ok: false, error: "unsupported_action" }, origin);
  } catch (error: any) {
    console.error("performance-admin", action, error?.message || error);
    const message = String(error?.message || error);
    return reply(message === "client_not_found" ? 404 : 409, { ok: false, error: "operation_failed", detail: message.slice(0, 600) }, origin);
  }
});
