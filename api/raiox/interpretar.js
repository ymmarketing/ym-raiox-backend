/**
 * POST /api/raiox/interpretar
 *
 * Modo legado:
 *   { packet, responses, ref } -> RX_REPORT_1.1
 *
 * Modo RX_DIGITAL_2.0 (sem criar nova função Vercel):
 *   { action:'EVIDENCE_TOKEN', ref } -> token curto assinado para upload privado.
 */
import { aplicarCors, exigirMetodo } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { refValida, erroSeguro, log, limitarTaxa } from '../../lib/security.js';
import { evidenceTokenConfigured, mintEvidenceToken } from '../../lib/raiox-evidence-token.js';
import {
  gerarInterpretacaoRaiox,
  temChaveRaioxInterpretativo,
  REPORT_VERSION,
} from '../../lib/raiox-report-v1-1.js';

const EXIGE_PAGAMENTO =
  String(process.env.REQUER_PAGAMENTO_RELATORIO ?? 'true').toLowerCase() !== 'false';

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === 'object' ? body : null;
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
  for (let i = 1; i <= 30; i++) {
    if (!ids.has(`RX${String(i).padStart(2, '0')}`)) return false;
  }
  const totalChars = responses.reduce((n, r) => n + r.question.length + String(r.answer || '').length, 0);
  return totalChars <= 40000;
}

async function evidenceGrant(body, ip, res) {
  if (!temRedis) {
    return erroSeguro(res, 503, 'Upload de evidências temporariamente indisponível.', {
      causa: 'storage_de_sessao_ausente',
    });
  }
  if (!evidenceTokenConfigured) {
    return erroSeguro(res, 503, 'Upload de evidências temporariamente indisponível.', {
      causa: 'evidence_secret_ausente',
    });
  }
  const rate = await limitarTaxa(store, `evidence-token:${ip}`, 10);
  if (!rate) return erroSeguro(res, 429, 'Muitas tentativas. Aguarde um minuto.', { ip });

  const ref = body?.ref;
  if (!ref || !refValida(ref)) {
    return erroSeguro(res, 403, 'Acesso não autorizado.', { causa: 'ref_invalida' });
  }

  let registro;
  try {
    registro = await store.buscar(ref);
  } catch (e) {
    return erroSeguro(res, 503, 'Serviço temporariamente indisponível.', { motivo: e.message });
  }
  if (!registro || registro.status !== STATUS.APPROVED) {
    log('warn', 'Tentativa de obter token de evidência sem acesso aprovado.', {
      ref,
      status: registro?.status || 'inexistente',
    });
    return erroSeguro(res, 403, 'Acesso não autorizado.');
  }

  const minted = mintEvidenceToken({ ref, maxFiles: 5 });
  return res.status(200).json({
    ok: true,
    action: 'EVIDENCE_TOKEN',
    token_version: 'RX_EVIDENCE_TOKEN_1.0',
    upload_token: minted.token,
    expires_at: minted.expires_at,
    upload_url: process.env.RAIOX_EVIDENCE_UPLOAD_URL || null,
    analyze_url: process.env.RAIOX_EVIDENCE_ANALYZE_URL || null,
    limits: {
      max_files: 5,
      max_bytes: 8000000,
      accepted_types: ['image/jpeg', 'image/png', 'image/webp'],
    },
  });
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  if (exigirMetodo(req, res, 'POST')) return;

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'desconhecido';

  const body = parseBody(req);
  if (!body) return erroSeguro(res, 400, 'Requisição inválida.');

  // RX_DIGITAL_2.0 reaproveita esta função para não ultrapassar o limite de
  // funções serverless do plano atual. O contrato permanece explicitamente versionado.
  if (body.action === 'EVIDENCE_TOKEN') {
    return evidenceGrant(body, ip, res);
  }

  if (!temChaveRaioxInterpretativo) {
    return erroSeguro(res, 503, 'Interpretação temporariamente indisponível.', {
      causa: 'ANTHROPIC_API_KEY ausente',
    });
  }

  if (temRedis) {
    const ok = await limitarTaxa(store, `raiox-interpretar:${ip}`, 6);
    if (!ok) return erroSeguro(res, 429, 'Muitas tentativas. Aguarde um minuto.', { ip });
  }

  const { packet, responses, ref } = body;
  if (!packet || typeof packet !== 'object') return erroSeguro(res, 400, 'Packet ausente.');
  if (!responsesCanonicamenteCompletas(responses)) {
    return erroSeguro(res, 400, 'Respostas em formato inesperado.');
  }
  let packetSize = 0;
  try { packetSize = JSON.stringify(packet).length; } catch { packetSize = Infinity; }
  if (packetSize > 120000) return erroSeguro(res, 413, 'Packet acima do limite permitido.');
  if (packet.source_product && packet.source_product !== 'RAIO_X_ESTRATEGICO') {
    return erroSeguro(res, 400, 'Produto de origem incompatível.');
  }
  if (!packet.score || !packet.p8_coverage) {
    return erroSeguro(res, 400, 'Packet canônico incompleto.');
  }

  if (EXIGE_PAGAMENTO) {
    if (!temRedis) {
      return erroSeguro(res, 503, 'Serviço temporariamente indisponível.', { causa: 'storage ausente' });
    }
    if (!ref || !refValida(ref)) {
      return erroSeguro(res, 403, 'Acesso não autorizado.', { causa: 'ref ausente/invalida' });
    }
    let registro;
    try {
      registro = await store.buscar(ref);
    } catch (e) {
      return erroSeguro(res, 503, 'Serviço temporariamente indisponível.', { motivo: e.message });
    }
    if (!registro || registro.status !== STATUS.APPROVED) {
      log('warn', 'Tentativa de interpretar Raio-X sem pagamento aprovado.', {
        ref,
        status: registro?.status || 'inexistente',
      });
      return erroSeguro(res, 403, 'Acesso não autorizado.');
    }
  }

  try {
    const interpretation = await gerarInterpretacaoRaiox(packet, responses);
    log('info', 'RX_REPORT_1.1 interpretado com sucesso.', {
      ref: ref || null,
      report_version: REPORT_VERSION,
      sources: responses.length,
    });
    return res.status(200).json({ ok: true, report_version: REPORT_VERSION, interpretation });
  } catch (e) {
    log('error', 'Falha na interpretação RX_REPORT_1.1', {
      ref: ref || null,
      motivo: e.message,
    });
    return erroSeguro(
      res,
      502,
      'A interpretação avançada não pôde ser concluída agora. O relatório-base continua disponível.',
      { motivo: e.message, ref: ref || null }
    );
  }
}
