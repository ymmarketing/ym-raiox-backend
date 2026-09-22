/**
 * /api/raiox/interpretar
 *
 * Mantém RX_REPORT_1.1 (legado atual) e concentra as operações do Raio-X V2
 * na mesma Serverless Function para respeitar o limite de Functions do plano.
 */
import crypto from 'node:crypto';
import { aplicarCors } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { refValida, erroSeguro, log, limitarTaxa, texto } from '../../lib/security.js';
import {
  gerarInterpretacaoRaiox,
  temChaveRaioxInterpretativo,
  REPORT_VERSION,
} from '../../lib/raiox-report-v1-1.js';
import {
  OPENAI_MODEL,
  deleteOpenAIFile,
} from '../../lib/raiox-v2-openai.js';
import { syncRaioxV22ToCrm } from '../../lib/raiox-crm-sync.js';
import { buildDeclaredIntake, buildDeclaredMetricPeriod, VOS_DECLARED_METRICS } from '../../lib/vos-intelligence-intake-v1.js';
import { generateVosIntelligenceReport, VOS_REPORT_MODEL, VOS_REPORT_VERSION } from '../../lib/vos-intelligence-report-v1.js';
import { temVosAiRuntime } from '../../lib/vos-intelligence-diagnostic-v1.js';

export const maxDuration = 300;

const EXIGE_PAGAMENTO = String(process.env.REQUER_PAGAMENTO_RELATORIO ?? 'true').toLowerCase() !== 'false';
const REQUIRED_V2 = Array.from({ length: 18 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`);
const MULTI_V2 = new Set(['Q06', 'Q10', 'Q13']);

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === 'object' ? body : null;
}
function clean(v, max = 5000) { return texto(v, max).trim(); }
function cleanArray(v, maxItems = 30) { return (Array.isArray(v) ? v : []).slice(0, maxItems).map(x => clean(x, 500)).filter(Boolean); }
function ipOf(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido'; }

async function approvedSession(ref) {
  if (!temRedis || !ref || !refValida(ref)) return null;
  try {
    const s = await store.buscar(ref);
    return s && s.status === STATUS.APPROVED ? s : null;
  } catch { return null; }
}

function responseShapeOk(r) {
  if (!r || typeof r !== 'object') return false;
  if (!/^RX(?:0[1-9]|[12][0-9]|30)$/.test(String(r.question_id || ''))) return false;
  if (typeof r.question !== 'string' || !r.question.trim() || r.question.length > 600) return false;
  if (r.answer != null && (typeof r.answer !== 'string' || r.answer.length > 5000)) return false;
  if (r.field_id != null && String(r.field_id).length > 160) return false;
  return true;
}
function responsesCanonicamenteCompletas(responses) {
  if (!Array.isArray(responses) || responses.length !== 30) return false;
  if (!responses.every(responseShapeOk)) return false;
  const ids = new Set(responses.map(r => r.question_id));
  if (ids.size !== 30) return false;
  for (let i = 1; i <= 30; i++) if (!ids.has(`RX${String(i).padStart(2, '0')}`)) return false;
  const totalChars = responses.reduce((n, r) => n + r.question.length + String(r.answer || '').length, 0);
  return totalChars <= 40000;
}

function sanitizeDraft(d, session) {
  const answers = {}, complements = {};
  for (let i = 1; i <= 18; i++) {
    const id = `Q${String(i).padStart(2, '0')}`;
    if (MULTI_V2.has(id)) {
      const a = cleanArray(d?.answers?.[id]);
      if (a.length) answers[id] = a;
    } else {
      const a = clean(d?.answers?.[id], 5000);
      if (a) answers[id] = a;
    }
    const c = clean(d?.complements?.[id], 3000);
    if (c) complements[id] = c;
  }
  const links = (Array.isArray(d?.links) ? d.links : []).slice(0, 8).map(x => ({
    type: clean(x?.type, 50), url: clean(x?.url, 1500), context: clean(x?.context, 1200),
  })).filter(x => x.url || x.context);
  const uploaded = new Map((session?.raioxV2Uploads || []).map(x => [x.file_id, x]));
  const images = (Array.isArray(d?.images) ? d.images : []).slice(0, 6).map(x => ({
    file_id: clean(x?.file_id, 120), name: clean(x?.name, 160), context: clean(x?.context, 1200),
    channel: clean(x?.channel, 50),
    visible_content_count: x?.visible_content_count === null || x?.visible_content_count === undefined || x?.visible_content_count === ''
      ? null
      : Math.max(0, Math.min(999, Number(x.visible_content_count) || 0)),
  })).filter(x => x.file_id && uploaded.has(x.file_id));
  const company = {
    segment: clean(d?.company?.segment, 220),
    business_model: clean(d?.company?.business_model, 80),
    region: clean(d?.company?.region, 220),
  };
  const metrics = {};
  const metric_unknown = {};
  for (const field of VOS_DECLARED_METRICS) {
    const value = d?.metrics?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') metrics[field] = clean(value, 60);
    metric_unknown[field] = d?.metric_unknown?.[field] === true;
  }
  return {
    business_name: clean(d?.business_name, 220),
    company, answers, complements, links, images, metrics, metric_unknown,
    metric_start: clean(d?.metric_start, 10),
    metric_end: clean(d?.metric_end, 10),
    q06main: clean(d?.q06main, 500),
    section: Number.isInteger(d?.section) ? Math.max(0, Math.min(7, d.section)) : 0,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeIntake(raw, allowedFileIds) {
  const answers = {};
  for (const id of REQUIRED_V2) answers[id] = clean(raw?.answers?.[id], 5000);
  const complements = {};
  for (const [k, v] of Object.entries(raw?.complements || {})) {
    if (/^Q(?:0[1-9]|1[0-8])$/.test(k) && clean(v, 3000)) complements[k] = clean(v, 3000);
  }
  const links = (Array.isArray(raw?.links) ? raw.links : []).slice(0, 8).map((l, i) => ({
    id: `LINK${String(i + 1).padStart(2, '0')}`,
    type: clean(l?.type, 50), url: clean(l?.url, 1500), context: clean(l?.context, 1200),
  })).filter(x => x.url);
  const images = (Array.isArray(raw?.images) ? raw.images : []).slice(0, 6).map((im, i) => ({
    id: `IMG${String(i + 1).padStart(2, '0')}`,
    name: clean(im?.name, 160), context: clean(im?.context, 1200), file_id: clean(im?.file_id, 120),
    channel: clean(im?.channel, 50),
    visible_content_count: im?.visible_content_count === null || im?.visible_content_count === undefined || im?.visible_content_count === ''
      ? null
      : Math.max(0, Math.min(999, Number(im.visible_content_count) || 0)),
  })).filter(x => x.file_id && allowedFileIds.has(x.file_id));
  const metricPeriod = clean(raw?.metrics?.metric_period, 60)
    || buildDeclaredMetricPeriod(raw?.metric_start, raw?.metric_end);
  const declared = buildDeclaredIntake({
    company: raw?.company,
    metrics: { ...(raw?.metrics || {}), metric_period: metricPeriod },
    metric_unknown: raw?.metric_unknown,
  });
  return {
    business_name: clean(raw?.business_name, 220),
    company: declared.company,
    metrics: declared.metrics,
    metric_unknown: declared.metric_unknown,
    declared_validation: declared.validation,
    answers, complements, links, images,
  };
}

function decodeDataUrl(v) {
  const m = String(v || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('Formato de imagem não aceito.');
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length || buffer.length > 420 * 1024) throw new Error('A imagem deve ter no máximo 420 KB após compressão.');
  return { mime: m[1], buffer };
}

async function handleV2Get(req, res, action) {
  if (action === 'preview_session') {
    if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ ok: false, error: 'Rota não disponível.' });
    if (!temRedis) return res.status(503).json({ ok: false, error: 'Sessão indisponível.' });
    const rateOk = await limitarTaxa(store, `vos-preview-session:${ipOf(req)}`, 3);
    if (!rateOk) return res.status(429).json({ ok: false, error: 'Muitas sessões em sequência. Aguarde um minuto.' });
    const ref = `ym_raiox_${Date.now()}_mestre${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    await store.salvar(ref, {
      ref, status: STATUS.APPROVED, paymentId: null, customer: 'HOMOLOGAÇÃO VOS INTELLIGENCE', value: 0,
      origem: 'vos_intelligence_preview', createdAt: now, updatedAt: now,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `/vos-intelligence-client.html?ref=${encodeURIComponent(ref)}&validacao=1`);
  }
  if (action === 'status') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, ai_configured: temVosAiRuntime, provider: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_ENV ? 'vercel_ai_gateway' : 'openai_direct', model: VOS_REPORT_MODEL || OPENAI_MODEL, report_version: VOS_REPORT_VERSION });
  }
  if (action !== 'draft' && action !== 'draft_proxy') return res.status(400).json({ ok: false, error: 'Ação inválida.' });
  const ref = clean(req.query?.ref, 220);
  const session = await approvedSession(ref);
  if (!session) return res.status(403).json({ ok: false, error: 'Acesso não confirmado.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    draft: session.raioxV2Draft || null,
    uploads: session.raioxV2Uploads || [],
    report: session.raioxV2Report || null,
    usage: session.raioxV2Cost || null,
    locked: Boolean(session.raioxV2Report),
    business_name: session.raioxV2Intake?.business_name || session.raioxV2Draft?.business_name || null,
    crm_sync_status: session.raioxV2CrmSyncStatus || null,
  });
}

async function handleSaveDraft(req, res, body) {
  if (!temRedis) return res.status(503).json({ ok: false, error: 'Sessão indisponível.' });
  const ref = clean(body.ref, 220);
  const session = await approvedSession(ref);
  if (!session) return res.status(403).json({ ok: false, error: 'Acesso não confirmado.' });
  if (session.raioxV2Report) return res.status(409).json({ ok: false, error: 'Este Raio-X já foi concluído e está bloqueado para novas alterações.', code: 'RAIOX_LOCKED' });
  const ok = await limitarTaxa(store, `raiox-v2-draft:${ipOf(req)}`, 60);
  if (!ok) return res.status(429).json({ ok: false, error: 'Muitos salvamentos em sequência.' });
  const d = sanitizeDraft(body.draft || {}, session);
  await store.atualizar(ref, { raioxV2Draft: d });
  return res.status(200).json({ ok: true, savedAt: d.updatedAt });
}

async function handleUpload(req, res, body) {
  if (!temVosAiRuntime) return res.status(503).json({ ok: false, error: 'A conexão de IA ainda não está configurada no backend.', code: 'AI_NOT_CONFIGURED' });
  const ref = clean(body.ref, 220);
  const session = await approvedSession(ref);
  if (!session) return res.status(403).json({ ok: false, error: 'Acesso não confirmado.' });
  if (session.raioxV2Report) return res.status(409).json({ ok: false, error: 'Este Raio-X já foi concluído e não aceita novos materiais.', code: 'RAIOX_LOCKED' });
  const rateOk = await limitarTaxa(store, `raiox-v2-upload:${ipOf(req)}`, 12);
  if (!rateOk) return res.status(429).json({ ok: false, error: 'Muitos envios. Aguarde um minuto.' });
  const uploads = Array.isArray(session.raioxV2Uploads) ? session.raioxV2Uploads : [];
  if (uploads.length >= 6) return res.status(400).json({ ok: false, error: 'O limite atual é de 6 prints por Raio-X.' });
  try {
    const { mime, buffer } = decodeDataUrl(body.data_url);
    const base = (clean(body.name, 100).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_') || `print-${Date.now()}`).slice(0, 90);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const name = `${base}.${ext}`;
    const imageId = `img_${crypto.randomBytes(16).toString('hex')}`;
    await store.salvarImagem(ref, imageId, `data:${mime};base64,${buffer.toString('base64')}`);
    const item = { file_id: imageId, name, context: clean(body.context, 1200), bytes: buffer.length, storage: 'temporary_data_url', uploadedAt: new Date().toISOString() };
    const latest = await approvedSession(ref);
    const currentUploads = Array.isArray(latest?.raioxV2Uploads) ? latest.raioxV2Uploads : [];
    if (currentUploads.length >= 6) {
      await store.removerImagem(ref, imageId).catch(() => {});
      return res.status(400).json({ ok: false, error: 'O limite atual é de 6 prints por Raio-X.' });
    }
    const saved = await store.atualizar(ref, { raioxV2Uploads: [...currentUploads, item] });
    const savedUploads = Array.isArray(saved.raioxV2Uploads) ? saved.raioxV2Uploads : [];
    log('info', 'Print vinculado ao Raio-X V2', { ref, image_id: item.file_id, bytes: item.bytes, storage: item.storage, uploads: savedUploads.length });
    return res.status(200).json({ ok: true, file: item, uploads: savedUploads });
  } catch (e) {
    return res.status(400).json({ ok: false, error: clean(e?.message || 'Falha no upload.', 300) });
  }
}

async function handleGenerateV2(req, res, body) {
  if (!temRedis) return res.status(503).json({ ok: false, error: 'Sessão indisponível no momento.' });
  if (!temVosAiRuntime) return res.status(503).json({ ok: false, error: 'A conexão de IA ainda não está configurada no backend.', code: 'AI_NOT_CONFIGURED', model: VOS_REPORT_MODEL || OPENAI_MODEL });
  const rateOk = await limitarTaxa(store, `raiox-v2:${ipOf(req)}`, 5);
  if (!rateOk) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde um minuto.' });
  const ref = clean(body.ref, 220);
  const session = await approvedSession(ref);
  if (!session) return res.status(403).json({ ok: false, error: 'Pagamento ou acesso ainda não confirmado.' });

  // UM PAGAMENTO = UMA GERAÇÃO DE IA.
  if (session.raioxV2Report) {
    // Reabrir o relatório nunca chama a OpenAI. Se o CRM falhou antes, apenas o sync idempotente é tentado novamente.
    if (session.raioxV2Report?.report_version !== VOS_REPORT_VERSION && session.raioxV2CrmSyncStatus !== 'success') {
      try {
        const crm = await syncRaioxV22ToCrm({
          ref,
          intake: session.raioxV2Intake || session.raioxV2Draft || {},
          report: session.raioxV2Report,
          session,
          completedAt: session.raioxV2CompletedAt,
        });
        await store.atualizar(ref, {
          raioxV2CrmSyncStatus: 'success',
          raioxV2CrmSyncAt: new Date().toISOString(),
          raioxV2CrmIds: { intake_id: crm.intake_id, contact_id: crm.contact_id, opportunity_id: crm.opportunity_id },
          raioxV2CrmSyncError: null,
        });
      } catch (e) {
        const crmMsg = clean(e?.message || 'Falha no sync CRM.', 300);
        await store.atualizar(ref, { raioxV2CrmSyncStatus: 'error', raioxV2CrmSyncError: crmMsg, raioxV2CrmSyncErrorAt: new Date().toISOString() }).catch(() => {});
        log('warn', 'Retry de CRM do Raio-X V2.2 falhou, sem nova chamada de IA.', { ref, motivo: crmMsg });
      }
    }
    log('info', 'Requisição repetida devolveu relatório já salvo sem nova chamada de IA.', { ref });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, report: session.raioxV2Report, usage: session.raioxV2Cost || null, reused: true, incremental_cost_usd: 0 });
  }

  const allowedFileIds = new Set((session.raioxV2Uploads || []).map(x => x?.file_id).filter(Boolean));
  const intake = sanitizeIntake(body.intake || {}, allowedFileIds);
  const missing = REQUIRED_V2.filter(id => !intake.answers[id]);
  if (!intake.business_name) missing.unshift('BUSINESS_NAME');
  if (missing.length) return res.status(400).json({ ok: false, error: 'Existem respostas obrigatórias pendentes.', missing });
  if (!intake.declared_validation.valid) {
    return res.status(400).json({
      ok: false,
      error: 'Revise o contexto e os números informados. Cada número deve ter um valor válido ou estar marcado como “não sei”.',
      code: 'DECLARED_INTAKE_INVALID',
      fields: intake.declared_validation.errors,
    });
  }

  try {
    await store.atualizar(ref, {
      raioxV2Status: 'processing',
      raioxV2StartedAt: new Date().toISOString(),
      raioxV2Intake: {
        business_name: intake.business_name,
        company: intake.company,
        metrics: intake.metrics,
        metric_unknown: intake.metric_unknown,
        answers: intake.answers,
        complements: intake.complements,
        links: intake.links,
        images: intake.images.map(x => ({ id: x.id, name: x.name, context: x.context, channel: x.channel, visible_content_count: x.visible_content_count, file_id: x.file_id })),
      },
    });

    // VOS 1.0 usa exclusivamente o que o cliente declarou nesta execução.
    // Nenhuma leitura de CRM, Reportei ou outra base histórica ocorre neste caminho.
    const hydratedImages = await Promise.all(intake.images.map(async image => {
      if (!String(image.file_id || '').startsWith('img_')) return image; // sessão legada da OpenAI Files
      const imageUrl = await store.buscarImagem(ref, image.file_id);
      if (!imageUrl) throw new Error(`Imagem temporária indisponível para análise: ${image.id}`);
      return { ...image, image_url: imageUrl };
    }));
    const analysisIntake = { ...intake, images: hydratedImages };
    log('info', 'VOS Intelligence iniciando análise multimodal', {
      ref,
      links: intake.links.map(link => link.id),
      images: intake.images.map(image => image.id),
      provider_preference: hydratedImages.some(image => image.image_url) ? 'vercel_ai_gateway' : 'openai_direct_legacy',
    });
    const result = await generateVosIntelligenceReport(analysisIntake);
    await store.atualizar(ref, {
      raioxV2Status: 'completed',
      raioxV2CompletedAt: new Date().toISOString(),
      raioxV2ReportVersion: VOS_REPORT_VERSION,
      raioxV2Model: VOS_REPORT_MODEL,
      raioxV2Cost: result.cost,
      raioxV2Report: result.report,
      raioxV2LockedAt: new Date().toISOString(),
      raioxV2CrmSyncStatus: 'not_applicable_vie_validation',
      raioxV2Audit: result.audit,
    });

    await Promise.all(intake.images.map(image => String(image.file_id || '').startsWith('img_')
      ? store.removerImagem(ref, image.file_id)
      : deleteOpenAIFile(image.file_id)));
    if (intake.images.length) await store.atualizar(ref, { raioxV2Uploads: [], raioxV2MaterialsPurgedAt: new Date().toISOString() });

    log('info', 'VOS Intelligence 1.0 concluído sem leitura histórica e sem sync de CRM', {
      ref,
      provider: result.audit?.provider,
      model: result.audit?.model || VOS_REPORT_MODEL,
      cost_usd: result.cost?.estimated_total_usd,
      web_search_calls: result.audit?.web_search_calls || 0,
      links: result.report?.source_analysis?.links?.map(link => ({ id: link.id, fetch_status: link.status, ai_access_status: link.ai_access_status, evidence_basis: link.evidence_basis })) || [],
      images: result.report?.source_analysis?.images?.map(image => ({ id: image.id, status: image.status, evidence_basis: image.evidence_basis })) || [],
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, report: result.report, usage: result.cost, reused: false });
  } catch (e) {
    const msg = clean(e?.message || 'Falha na análise.', 500);
    log('error', 'Falha no Raio-X V2.2', { ref, motivo: msg });
    await store.atualizar(ref, { raioxV2Status: 'error', raioxV2Error: msg, raioxV2ErrorAt: new Date().toISOString() }).catch(() => {});
    return res.status(502).json({ ok: false, error: 'Não foi possível concluir a análise agora.', detail: process.env.NODE_ENV === 'development' ? msg : undefined });
  }
}

async function handleV1(req, res, body) {
  if (!temChaveRaioxInterpretativo) return erroSeguro(res, 503, 'Interpretação temporariamente indisponível.', { causa: 'ANTHROPIC_API_KEY ausente' });
  if (temRedis) {
    const ok = await limitarTaxa(store, `raiox-interpretar:${ipOf(req)}`, 6);
    if (!ok) return erroSeguro(res, 429, 'Muitas tentativas. Aguarde um minuto.', { ip: ipOf(req) });
  }
  const { packet, responses, ref } = body;
  if (!packet || typeof packet !== 'object') return erroSeguro(res, 400, 'Packet ausente.');
  if (!responsesCanonicamenteCompletas(responses)) return erroSeguro(res, 400, 'Respostas em formato inesperado.');
  let packetSize = 0;
  try { packetSize = JSON.stringify(packet).length; } catch { packetSize = Infinity; }
  if (packetSize > 120000) return erroSeguro(res, 413, 'Packet acima do limite permitido.');
  if (packet.source_product && packet.source_product !== 'RAIO_X_ESTRATEGICO') return erroSeguro(res, 400, 'Produto de origem incompatível.');
  if (!packet.score || !packet.p8_coverage) return erroSeguro(res, 400, 'Packet canônico incompleto.');

  if (EXIGE_PAGAMENTO) {
    if (!temRedis) return erroSeguro(res, 503, 'Serviço temporariamente indisponível.', { causa: 'storage ausente' });
    if (!ref || !refValida(ref)) return erroSeguro(res, 403, 'Acesso não autorizado.', { causa: 'ref ausente/invalida' });
    const registro = await approvedSession(ref);
    if (!registro) {
      log('warn', 'Tentativa de interpretar Raio-X sem pagamento aprovado.', { ref });
      return erroSeguro(res, 403, 'Acesso não autorizado.');
    }
  }

  try {
    const interpretation = await gerarInterpretacaoRaiox(packet, responses);
    log('info', 'RX_REPORT_1.1 interpretado com sucesso.', { ref: ref || null, report_version: REPORT_VERSION, sources: responses.length });
    return res.status(200).json({ ok: true, report_version: REPORT_VERSION, interpretation });
  } catch (e) {
    log('error', 'Falha na interpretação RX_REPORT_1.1', { ref: ref || null, motivo: e.message });
    return erroSeguro(res, 502, 'A interpretação avançada não pôde ser concluída agora. O relatório-base continua disponível.', { motivo: e.message, ref: ref || null });
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  const method = String(req.method || '').toUpperCase();
  const body = method === 'POST' ? parseBody(req) : null;
  const action = clean(method === 'GET' ? req.query?.action : (body?.action || req.query?.action), 40);

  if (method === 'GET') return handleV2Get(req, res, action);
  if (method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }
  if (!body) return erroSeguro(res, 400, 'Requisição inválida.');

  if (action === 'save_draft' || action === 'draft_proxy') return handleSaveDraft(req, res, body);
  if (action === 'upload_v2') return handleUpload(req, res, body);
  if (action === 'generate_v2') return handleGenerateV2(req, res, body);
  return handleV1(req, res, body);
}
