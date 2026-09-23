/**
 * GET /api/health
 * Diz se o backend está de pé e o que falta configurar.
 * NUNCA devolve o valor das chaves — só se existem.
 */

import { aplicarCors, exigirMetodo } from '../lib/cors.js';
import { store, temRedis } from '../lib/store.js';
import { temChaveAsaas, BASE_URL } from '../lib/asaas.js';
import { temChaveAnthropic } from '../lib/anthropic.js';
import { statusMestreExecucao } from '../lib/execution-master.js';
import { temVosAiRuntime } from '../lib/vos-intelligence-diagnostic-v1.js';
import { VOS_REPORT_MODEL, VOS_REPORT_VERSION } from '../lib/vos-intelligence-report-v1.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  if (exigirMetodo(req, res, 'GET')) return;

  let redis = { ok: false, tipo: 'memoria' };
  try {
    redis = await store.ping();
  } catch (e) {
    redis = { ok: false, tipo: 'upstash', erro: 'sem conexão' };
  }

  const mestreExecucao = statusMestreExecucao();
  const vosLiveAiEnabled = String(process.env.VOS_LIVE_AI_ENABLED || '').toLowerCase() === 'true';
  const vosPreviewMode = process.env.VERCEL_ENV === 'preview';
  const config = {
    asaas: temChaveAsaas,
    asaasAmbiente: process.env.ASAAS_ENV || 'production',
    asaasBaseUrl: BASE_URL,
    asaasWebhookToken: Boolean(process.env.ASAAS_WEBHOOK_TOKEN),
    anthropic: temChaveAnthropic,
    vosIntelligence: temVosAiRuntime,
    vosLiveAiEnabled,
    vosPreviewOneTimeEnabled: vosPreviewMode,
    vosProvider: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_ENV ? 'vercel_ai_gateway' : 'openai_direct',
    vosModel: VOS_REPORT_MODEL,
    vosReportVersion: VOS_REPORT_VERSION,
    vosTimeoutMs: Number(process.env.OPENAI_VOS_TIMEOUT_MS || 240000),
    vosMaxOutputTokens: Number(process.env.OPENAI_VOS_MAX_OUTPUT_TOKENS || 7000),
    redis: temRedis,
    redisConectado: redis.ok,
    preco: process.env.PRODUCT_PRICE || '97',
    produto: process.env.PRODUCT_NAME || 'Raio-X Estratégico',
    baseUrl: process.env.PUBLIC_BASE_URL || null,
    siteUrl: process.env.SITE_URL || null,
    origensPermitidas: Boolean(process.env.ALLOWED_ORIGINS),
    /* O mestre só existe em sandbox. Em production é sempre recusado,
       mesmo que a variável tenha ficado cadastrada. */
    codigoMestreAtivo:
      Boolean(process.env.CODIGO_MESTRE) &&
      (process.env.ASAAS_ENV || 'production').toLowerCase() !== 'production',
    codigoMestreExecucaoAtivo: mestreExecucao.ativo,
    codigoMestreExecucaoExpiraEm: mestreExecucao.expiraEm,
    codigoMestreExecucaoPermitidoEmProducao: mestreExecucao.permitidoEmProducao,
  };

  const faltando = [];
  if (!config.asaas) faltando.push('ASAAS_API_KEY');
  if (!config.asaasWebhookToken) faltando.push('ASAAS_WEBHOOK_TOKEN');
  if (!config.anthropic) faltando.push('ANTHROPIC_API_KEY');
  if (!config.redis) faltando.push('UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN');
  if (!config.siteUrl) faltando.push('SITE_URL (o cliente não volta automaticamente após pagar)');

  const faltandoVos = [];
  if (!config.redis) faltandoVos.push('UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN');
  if (!config.vosIntelligence) faltandoVos.push('AI_GATEWAY/OIDC ou OPENAI_API_KEY');
  if (!vosLiveAiEnabled && !vosPreviewMode) faltandoVos.push('VOS_LIVE_AI_ENABLED=true');

  const alertas = [];
  if (process.env.CODIGO_MESTRE && (process.env.ASAAS_ENV || '').toLowerCase() === 'production') {
    alertas.push(
      'Variável CODIGO_MESTRE ainda cadastrada. Ela é ignorada em production (trava de ambiente), mas convém remover.'
    );
  }
  if (config.codigoMestreAtivo) {
    alertas.push('Código-mestre ATIVO (sandbox). Isto é esperado em ambiente de teste.');
  }
  if (config.codigoMestreExecucaoAtivo) {
    alertas.push(`Código mestre temporário de execução ativo até ${config.codigoMestreExecucaoExpiraEm}.`);
  }

  const pronto = faltando.length === 0 && redis.ok;
  const prontoVos = faltandoVos.length === 0 && redis.ok;

  res.status(200).json({
    ok: true,
    pronto,
    prontoVos,
    versao: '1.3.0',
    ts: new Date().toISOString(),
    config,
    faltando,
    faltandoVos,
    alertas,
    aviso: pronto
      ? null
      : 'Backend incompleto. Enquanto faltar configuração, o fluxo automático não libera acesso — use o código manual e o WhatsApp.',
  });
}
