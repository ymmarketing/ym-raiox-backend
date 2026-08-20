/**
 * Cliente da API Asaas.
 *
 * Autenticação (docs oficiais):
 *   header  access_token: <ASAAS_API_KEY>
 *   header  User-Agent:  obrigatório em contas criadas após 13/06/2024
 *
 * Ambientes:
 *   produção  https://api.asaas.com/v3        (chave começa com $aact_prod_)
 *   sandbox   https://api-sandbox.asaas.com/v3 (chave começa com $aact_hmlg_)
 *
 * A chave NUNCA aparece em log. Use mascarar() se precisar depurar.
 */

import { log } from './security.js';

const API_KEY = process.env.ASAAS_API_KEY;
const AMBIENTE = (process.env.ASAAS_ENV || 'production').toLowerCase();

export const BASE_URL =
  AMBIENTE === 'sandbox'
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3';

export const temChaveAsaas = Boolean(API_KEY);

function headers() {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'YM-RaioX-Estrategico/1.0',
    access_token: API_KEY,
  };
}

async function requisitar(caminho, opcoes = {}) {
  if (!API_KEY) {
    throw new Error('ASAAS_API_KEY não configurada.');
  }
  const url = `${BASE_URL}${caminho}`;
  const resp = await fetch(url, { ...opcoes, headers: headers() });
  const texto = await resp.text();

  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = { raw: texto.slice(0, 300) };
  }

  if (!resp.ok) {
    const detalhe = corpo?.errors?.[0]?.description || `HTTP ${resp.status}`;
    log('error', 'Falha na API do Asaas', {
      caminho,
      status: resp.status,
      detalhe,
    });
    const err = new Error(detalhe);
    err.status = resp.status;
    err.asaas = corpo;
    throw err;
  }
  return corpo;
}

/**
 * Localiza um cliente pelo CPF/CNPJ (preferencialmente) ou e-mail,
 * e cria um novo apenas quando não houver correspondência.
 * O Asaas exige um customer para criar cobrança.
 */
export async function acharOuCriarCliente({ nome, email, telefone, documento }) {
  // 1. CPF/CNPJ é a chave preferencial de conciliação do checkout de produção.
  //    Isso evita criar clientes duplicados a cada tentativa de pagamento.
  if (documento) {
    try {
      const busca = await requisitar(
        `/customers?cpfCnpj=${encodeURIComponent(documento)}&limit=1`,
        { method: 'GET' }
      );
      if (busca?.data?.length) return busca.data[0].id;
    } catch (e) {
      log('warn', 'Busca de cliente por CPF/CNPJ falhou; tentando outras formas.', {
        motivo: e.message,
      });
    }
  }

  // 2. fallback por e-mail, quando informado
  if (email) {
    try {
      const busca = await requisitar(
        `/customers?email=${encodeURIComponent(email)}&limit=1`,
        { method: 'GET' }
      );
      if (busca?.data?.length) return busca.data[0].id;
    } catch (e) {
      log('warn', 'Busca de cliente por e-mail falhou; seguindo para criação.', {
        motivo: e.message,
      });
    }
  }

  // 3. cria
  const corpo = {
    name: nome || 'Cliente Raio-X',
    ...(email ? { email } : {}),
    ...(telefone ? { mobilePhone: telefone } : {}),
    ...(documento ? { cpfCnpj: documento } : {}),
  };

  const criado = await requisitar('/customers', {
    method: 'POST',
    body: JSON.stringify(corpo),
  });
  return criado.id;
}

/**
 * Cria a cobrança e devolve { id, invoiceUrl, status }.
 *
 * billingType UNDEFINED = o cliente escolhe (Pix, boleto, cartão) na fatura.
 * externalReference = nossa ref única, que volta no webhook.
 *
 * callback.successUrl = para onde o Asaas manda o cliente depois de pagar.
 * A confirmação deve voltar DIRETO para o fluxo do Raio-X, e não para a Home.
 * Levamos a ref na URL para o site reconhecer o pagamento mesmo que o
 * localStorage tenha sido perdido (ex.: pagou no navegador anônimo).
 */
export async function criarCobranca({ customerId, valor, descricao, ref, vencimentoDias = 3 }) {
  const venc = new Date();
  venc.setDate(venc.getDate() + vencimentoDias);
  const dueDate = venc.toISOString().slice(0, 10); // YYYY-MM-DD

  const corpo = {
    customer: customerId,
    billingType: 'UNDEFINED',
    value: Number(valor),
    dueDate,
    description: descricao,
    externalReference: ref,
  };

  // URL de retorno com a ref (se SITE_URL estiver configurada).
  // Nunca retornar para a Home: a ref pertence ao fluxo protegido do Raio-X.
  const siteUrl = (process.env.SITE_URL || '').trim().replace(/\/$/, '');
  if (siteUrl) {
    corpo.callback = {
      successUrl: `${siteUrl}/raio-x.html?ref=${encodeURIComponent(ref)}`,
      autoRedirect: true,
    };
  }

  const pag = await requisitar('/payments', {
    method: 'POST',
    body: JSON.stringify(corpo),
  });

  return {
    id: pag.id,
    invoiceUrl: pag.invoiceUrl,
    status: pag.status,
    value: pag.value,
    externalReference: pag.externalReference,
  };
}

/**
 * Consulta uma cobrança direto na API.
 * Usado como DUPLA VALIDAÇÃO do webhook: nunca aprovamos só porque
 * chegou um POST dizendo que foi pago.
 */
export async function consultarCobranca(paymentId) {
  return requisitar(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

/**
 * Traduz o status do Asaas para o nosso vocabulário interno.
 * Fonte: docs de status de cobrança.
 */
export function traduzirStatus(statusAsaas) {
  switch (String(statusAsaas || '').toUpperCase()) {
    case 'CONFIRMED':
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
      return 'approved';
    case 'PENDING':
      return 'pending';
    case 'AWAITING_RISK_ANALYSIS':
      return 'pending';
    case 'OVERDUE':
      return 'expired';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
      return 'refunded';
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
      return 'refused';
    case 'DELETED':
      return 'canceled';
    default:
      return 'pending';
  }
}

/**
 * Traduz o EVENTO do webhook. O evento é mais específico que o status.
 * Eventos que aprovam: PAYMENT_CONFIRMED, PAYMENT_RECEIVED.
 */
export function statusPorEvento(evento) {
  switch (String(evento || '').toUpperCase()) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_RECEIVED_IN_CASH':
      return 'approved';

    case 'PAYMENT_CREATED':
    case 'PAYMENT_UPDATED':
    case 'PAYMENT_AWAITING_RISK_ANALYSIS':
    case 'PAYMENT_AUTHORIZED':
      return 'pending';

    case 'PAYMENT_OVERDUE':
      return 'expired';

    case 'PAYMENT_DELETED':
      return 'canceled';

    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_REFUND_IN_PROGRESS':
      return 'refunded';

    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
    case 'PAYMENT_CHARGEBACK_DISPUTE':
      return 'refused';

    default:
      return null; // evento que não muda status
  }
}
