/**
 * POST /api/pagamento/criar
 *
 * Cria uma cobrança dinâmica no Asaas com uma referência única e rastreável.
 * O CPF/CNPJ é usado somente para a cobrança e não é persistido no storage do Raio-X.
 */

import { aplicarCors, exigirMetodo } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { acharOuCriarCliente, criarCobranca, temChaveAsaas } from '../../lib/asaas.js';
import {
  gerarRef,
  log,
  erroSeguro,
  limitarTaxa,
  texto,
  emailValido,
  digitos,
} from '../../lib/security.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;
  if (exigirMetodo(req, res, 'POST')) return;

  if (!temRedis) {
    return erroSeguro(res, 503, 'Pagamento automático indisponível no momento. Use o botão do WhatsApp para concluir sua compra.', { causa: 'UPSTASH nao configurado' });
  }
  if (!temChaveAsaas) {
    return erroSeguro(res, 503, 'Pagamento automático indisponível no momento. Use o botão do WhatsApp para concluir sua compra.', { causa: 'ASAAS_API_KEY ausente' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido';
  const dentroDoLimite = await limitarTaxa(store, `criar:${ip}`, 10);
  if (!dentroDoLimite) return erroSeguro(res, 429, 'Muitas tentativas. Aguarde um minuto e tente de novo.', { ip });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const nome = texto(body.nome, 100) || 'Cliente Raio-X';
  const email = texto(body.email, 120);
  const telefone = digitos(body.telefone, 15);
  const documento = digitos(body.documento, 14);

  if (email && !emailValido(email)) return erroSeguro(res, 400, 'E-mail inválido.');
  if (documento.length !== 11 && documento.length !== 14) {
    return erroSeguro(res, 400, 'Informe um CPF ou CNPJ válido para gerar a cobrança.', { causa: 'documento_ausente_ou_incompleto' });
  }

  const ref = gerarRef();
  const valor = Number(process.env.PRODUCT_PRICE || 97);
  const nomeProduto = process.env.PRODUCT_NAME || 'Raio-X Estratégico';
  const descricao = `${nomeProduto} — YM Marketing & Negócios`;
  const safePayer = {
    customerName: nome || null,
    customerEmail: email || null,
    customerPhone: telefone || null,
  };

  try {
    await store.salvar(ref, {
      ref,
      status: STATUS.PENDING,
      paymentId: null,
      customer: email || nome || null,
      ...safePayer,
      value: valor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const customerId = await acharOuCriarCliente({ nome, email, telefone, documento });
    const cobranca = await criarCobranca({ customerId, valor, descricao, ref });

    await store.atualizar(ref, {
      status: STATUS.PENDING,
      paymentId: cobranca.id,
      customer: email || nome || null,
      ...safePayer,
      value: cobranca.value ?? valor,
    });
    await store.indexarPagamento(cobranca.id, ref);

    log('info', 'Cobrança criada', { ref, paymentId: cobranca.id, valor });
    if (!cobranca.invoiceUrl) throw new Error('Asaas não devolveu invoiceUrl.');

    return res.status(200).json({ ok: true, ref, paymentUrl: cobranca.invoiceUrl, status: STATUS.PENDING });
  } catch (e) {
    try { await store.atualizar(ref, { status: STATUS.ERROR, erro: 'falha ao criar cobranca' }); } catch {}
    return erroSeguro(res, 502, 'Não foi possível iniciar o pagamento agora. Tente novamente ou fale conosco pelo WhatsApp.', { ref, motivo: e.message });
  }
}
