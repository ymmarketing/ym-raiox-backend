/**
 * GET /api/pagamento/status?ref=<referencia>
 *
 * Devolve o status real, lido do storage (escrito pelo webhook ou pela
 * conferência direta na API do Asaas, quando o webhook não chegou).
 * Se a referência não existir, devolve "pending" — NUNCA libera.
 *
 * Resposta:
 *   { status, ref, updatedAt }
 *   { status: "pending", message: "Pagamento ainda não localizado." }
 */

import { aplicarCors, exigirMetodo } from '../../lib/cors.js';
import { store, STATUS, STATUS_VALIDOS, temRedis } from '../../lib/store.js';
import { refValida, log } from '../../lib/security.js';
import { consultarCobranca, traduzirStatus, temChaveAsaas } from '../../lib/asaas.js';
import { enviarEmailAcesso } from '../../lib/email-acesso.js';

/*
 * Rede de segurança: se o webhook do Asaas não chegou (desativado, token
 * errado, fila pausada), o status consulta a cobrança DIRETO na API do Asaas.
 * Mesmas regras do webhook: só aprova se a API disser pago E o valor bater.
 * No máximo uma consulta ao Asaas a cada 10 s por referência.
 */
async function conferirNoAsaas(ref, registro) {
  if (!temChaveAsaas || !registro?.paymentId) return registro;
  if (registro.status !== STATUS.PENDING && registro.status !== STATUS.AWAITING_PIX) return registro;
  try {
    const n = await store.incr(`ym:reconc:${ref}`, 10);
    if (n > 1) return registro;
    const real = await consultarCobranca(registro.paymentId);
    let novo = traduzirStatus(real?.status);
    if (real?.externalReference && real.externalReference !== ref) return registro;
    const esperado = Number(process.env.PRODUCT_PRICE || 97);
    if (novo === STATUS.APPROVED && real?.value != null && Math.abs(Number(real.value) - esperado) > 0.01) {
      log('error', 'Conferência: valor pago diferente do esperado.', { ref, pago: real.value, esperado });
      novo = STATUS.PENDING;
    }
    if (!STATUS_VALIDOS.includes(novo) || novo === registro.status) return registro;
    const atualizado = await store.atualizar(ref, {
      status: novo,
      rawEvent: { event: 'RECONCILIACAO_STATUS', status: real?.status || null, billingType: real?.billingType || null },
    });
    log('info', 'Status atualizado pela conferência direta no Asaas.', { ref, status: novo });
    return atualizado;
  } catch (e) {
    log('warn', 'Conferência no Asaas falhou; mantendo status.', { ref, motivo: e.message });
    return registro;
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  if (exigirMetodo(req, res, 'GET')) return;

  // sem cache: o status muda
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const ref = String(req.query?.ref || '').trim();

  if (!ref || !refValida(ref)) {
    return res.status(200).json({
      status: STATUS.PENDING,
      message: 'Pagamento ainda não localizado.',
    });
  }

  if (!temRedis) {
    // Sem storage não existe verdade a consultar. Não libera.
    log('error', 'status consultado sem storage configurado', { ref });
    return res.status(200).json({
      status: STATUS.PENDING,
      message: 'Pagamento ainda não localizado.',
    });
  }

  try {
    let registro = await conferirNoAsaas(ref, await store.buscar(ref));
    // aprovado e ainda sem e-mail de acesso: envia o link pessoal (uma vez)
    if (registro?.status === STATUS.APPROVED && !registro.emailAcessoEnviadoEm) {
      registro = await enviarEmailAcesso(ref, registro);
    }

    if (!registro) {
      return res.status(200).json({
        status: STATUS.PENDING,
        message: 'Pagamento ainda não localizado.',
      });
    }

    // defesa: nunca devolver um status fora do vocabulário
    const status = STATUS_VALIDOS.includes(registro.status)
      ? registro.status
      : STATUS.PENDING;

    return res.status(200).json({
      status,
      ref,
      updatedAt: registro.updatedAt || null,
    });
  } catch (e) {
    log('error', 'Falha ao consultar status', { ref, motivo: e.message });
    // erro de infraestrutura não pode virar liberação
    return res.status(200).json({
      status: STATUS.PENDING,
      message: 'Pagamento ainda não localizado.',
    });
  }
}
