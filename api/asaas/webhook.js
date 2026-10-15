/**
 * POST /api/asaas/webhook
 *
 * Recebe os eventos do Asaas e é a ÚNICA fonte que pode marcar approved.
 *
 * Camadas de segurança:
 *  1. Token: o Asaas envia o authToken no header `asaas-access-token`.
 *     Comparamos em tempo constante com ASAAS_WEBHOOK_TOKEN.
 *  2. Dupla validação: antes de aprovar, consultamos a cobrança direto na
 *     API do Asaas. Um POST forjado não sobrevive a essa checagem.
 *  3. Idempotência: o mesmo evento (id) não é processado duas vezes.
 *
 * Sempre responde rápido. Status 2xx = Asaas considera entregue.
 */

import { enviarEmailAcesso } from '../../lib/email-acesso.js';
import { store, STATUS } from '../../lib/store.js';
import {
  consultarCobranca,
  statusPorEvento,
  traduzirStatus,
  temChaveAsaas,
} from '../../lib/asaas.js';
import { comparacaoSegura, log } from '../../lib/security.js';

const TOKEN_ESPERADO = process.env.ASAAS_WEBHOOK_TOKEN;

export default async function handler(req, res) {
  // Webhook não é chamado por navegador: sem CORS.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  /* ---------- 1. autenticação do webhook ---------- */
  const tokenRecebido = req.headers['asaas-access-token'];

  if (!TOKEN_ESPERADO) {
    log('error', 'ASAAS_WEBHOOK_TOKEN não configurado — webhook recusado.');
    // 401: o Asaas vai reenfileirar. Melhor que aceitar sem autenticar.
    return res.status(401).json({ ok: false });
  }

  if (!tokenRecebido || !comparacaoSegura(tokenRecebido, TOKEN_ESPERADO)) {
    log('error', 'Webhook com token inválido.', {
      temToken: Boolean(tokenRecebido),
    });
    return res.status(401).json({ ok: false });
  }

  /* ---------- 2. corpo ---------- */
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== 'object') {
    log('error', 'Webhook com corpo inválido.');
    return res.status(200).json({ ok: true, ignorado: 'corpo invalido' });
  }

  const eventoId = body.id || null;
  const evento = body.event || null;
  const pagamento = body.payment || null;

  if (!evento || !pagamento) {
    return res.status(200).json({ ok: true, ignorado: 'sem evento ou payment' });
  }

  /* ---------- 3. idempotência ---------- */
  try {
    if (eventoId && (await store.eventoJaProcessado(eventoId))) {
      log('info', 'Evento repetido, ignorado.', { eventoId, evento });
      return res.status(200).json({ ok: true, repetido: true });
    }
  } catch (e) {
    log('warn', 'Checagem de idempotência falhou; seguindo.', { motivo: e.message });
  }

  /* ---------- 4. achar a referência ---------- */
  const paymentId = pagamento.id || null;
  let ref = pagamento.externalReference || null;

  if (!ref && paymentId) {
    try {
      ref = await store.refPorPagamento(paymentId);
    } catch {
      ref = null;
    }
  }

  if (!ref) {
    // Pagamento que não nasceu do nosso fluxo (ex.: link fixo antigo).
    // Registramos para auditoria, mas não há a quem liberar.
    log('warn', 'Webhook sem referência rastreável.', { evento, paymentId });
    return res.status(200).json({ ok: true, semRef: true });
  }

  /* ---------- 5. decidir o novo status ---------- */
  let novoStatus = statusPorEvento(evento);
  if (!novoStatus) {
    log('info', 'Evento não altera status.', { evento, ref });
    return res.status(200).json({ ok: true, ignorado: evento });
  }

  /* ---------- 6. DUPLA VALIDAÇÃO antes de aprovar ---------- */
  if (novoStatus === STATUS.APPROVED) {
    if (!temChaveAsaas) {
      log('error', 'Sem ASAAS_API_KEY: não é possível confirmar o pagamento.', { ref });
      return res.status(200).json({ ok: true, naoConfirmado: true });
    }
    try {
      const real = await consultarCobranca(paymentId);
      const statusReal = traduzirStatus(real?.status);
      if (statusReal !== STATUS.APPROVED) {
        log('error', 'Webhook dizia aprovado, mas a API do Asaas discorda.', {
          ref,
          paymentId,
          statusAsaas: real?.status,
        });
        // não aprova. Grava o que a API disse.
        novoStatus = statusReal;
      }
      // confere o valor: só aprova se bater com o preço do produto.
      // Tolerância de 1 centavo para arredondamento.
      const esperado = Number(process.env.PRODUCT_PRICE || 97);
      if (real?.value != null && Math.abs(Number(real.value) - esperado) > 0.01) {
        log('error', 'Valor pago diferente do esperado.', {
          ref,
          pago: real.value,
          esperado,
        });
        novoStatus = STATUS.PENDING;
      }
    } catch (e) {
      log('error', 'Falha ao confirmar cobrança na API do Asaas.', {
        ref,
        motivo: e.message,
      });
      // 500 faz o Asaas reenviar depois — melhor que aprovar às cegas.
      return res.status(500).json({ ok: false });
    }
  }

  /* ---------- 7. gravar ---------- */
  try {
    const registro = await store.atualizar(ref, {
      status: novoStatus,
      paymentId,
      customer: pagamento.customer || null,
      value: pagamento.value ?? null,
      rawEvent: {
        id: eventoId,
        event: evento,
        status: pagamento.status || null,
        billingType: pagamento.billingType || null,
        dateCreated: body.dateCreated || null,
      },
    });
    if (paymentId) await store.indexarPagamento(paymentId, ref);
    if (registro.status === STATUS.APPROVED) await enviarEmailAcesso(ref, registro);

    log('info', 'Status atualizado pelo webhook.', {
      ref,
      evento,
      status: registro.status,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    log('error', 'Falha ao gravar status.', { ref, motivo: e.message });
    // 500 → Asaas reenvia. Não perdemos a confirmação.
    return res.status(500).json({ ok: false });
  }
}
