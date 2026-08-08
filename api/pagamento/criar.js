/**
 * POST /api/pagamento/criar
 *
 * Cria uma cobrança dinâmica no Asaas com uma referência única e rastreável.
 * É isso que permite o fluxo automático: o webhook devolve essa referência,
 * e só então o acesso é liberado para AQUELE cliente.
 *
 * Body:
 *   { documento, nome?, email?, telefone? }
 *
 * documento (CPF/CNPJ) é obrigatório porque o Asaas de produção exige
 * identificação do pagador para criação da cobrança. O documento não é
 * persistido no storage do Raio-X.
 *
 * Resposta:
 *   { ok: true, ref, paymentUrl, status: "pending" }
 *   { ok: false, error: "..." }
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

  // Sem storage não há como rastrear o pagamento depois. Falhar cedo e claro.
  if (!temRedis) {
    return erroSeguro(
      res,
      503,
      'Pagamento automático indisponível no momento. Use o botão do WhatsApp para concluir sua compra.',
      { causa: 'UPSTASH nao configurado' }
    );
  }
  if (!temChaveAsaas) {
    return erroSeguro(
      res,
      503,
      'Pagamento automático indisponível no momento. Use o botão do WhatsApp para concluir sua compra.',
      { causa: 'ASAAS_API_KEY ausente' }
    );
  }

  // rate limit simples por IP
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'desconhecido';
  const dentroDoLimite = await limitarTaxa(store, `criar:${ip}`, 10);
  if (!dentroDoLimite) {
    return erroSeguro(res, 429, 'Muitas tentativas. Aguarde um minuto e tente de novo.', { ip });
  }

  // corpo
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const nome = texto(body.nome, 100) || 'Cliente Raio-X';
  const email = texto(body.email, 120);
  const telefone = digitos(body.telefone, 15);
  const documento = digitos(body.documento, 14);

  if (email && !emailValido(email)) {
    return erroSeguro(res, 400, 'E-mail inválido.');
  }

  // Em produção o Asaas exige CPF/CNPJ para criar a cobrança.
  // Validamos somente formato/tamanho aqui; a validade cadastral é validada pelo Asaas.
  if (documento.length !== 11 && documento.length !== 14) {
    return erroSeguro(
      res,
      400,
      'Informe um CPF ou CNPJ válido para gerar a cobrança.',
      { causa: 'documento_ausente_ou_incompleto' }
    );
  }

  const ref = gerarRef();
  const valor = Number(process.env.PRODUCT_PRICE || 97);
  const nomeProduto = process.env.PRODUCT_NAME || 'Raio-X Estratégico';
  const descricao = `${nomeProduto} — YM Marketing & Negócios`;

  try {
    // 1) grava como pending ANTES de chamar o Asaas.
    //    Se o Asaas responder e nossa gravação falhar, o webhook ainda acha a ref.
    //    O CPF/CNPJ não é armazenado neste registro.
    await store.salvar(ref, {
      ref,
      status: STATUS.PENDING,
      paymentId: null,
      customer: email || nome || null,
      value: valor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2) cliente no Asaas
    const customerId = await acharOuCriarCliente({ nome, email, telefone, documento });

    // 3) cobrança com externalReference = nossa ref
    const cobranca = await criarCobranca({
      customerId,
      valor,
      descricao,
      ref,
    });

    // 4) guarda o paymentId e indexa (o webhook pode chegar sem externalReference)
    await store.atualizar(ref, {
      status: STATUS.PENDING,
      paymentId: cobranca.id,
      customer: email || nome || null,
      value: cobranca.value ?? valor,
    });
    await store.indexarPagamento(cobranca.id, ref);

    log('info', 'Cobrança criada', { ref, paymentId: cobranca.id, valor });

    if (!cobranca.invoiceUrl) {
      throw new Error('Asaas não devolveu invoiceUrl.');
    }

    return res.status(200).json({
      ok: true,
      ref,
      paymentUrl: cobranca.invoiceUrl,
      status: STATUS.PENDING,
    });
  } catch (e) {
    // marca a ref como erro para auditoria, mas não trava o cliente
    try {
      await store.atualizar(ref, { status: STATUS.ERROR, erro: 'falha ao criar cobranca' });
    } catch {
      /* ignora */
    }
    return erroSeguro(
      res,
      502,
      'Não foi possível iniciar o pagamento agora. Tente novamente ou fale conosco pelo WhatsApp.',
      { ref, motivo: e.message }
    );
  }
}
