/**
 * E-mail de acesso ao Raio-X (Resend).
 *
 * Enviado uma única vez, quando a referência fica "approved" (webhook do
 * Asaas ou conferência direta no status). Leva o link pessoal do Raio-X:
 * o progresso é salvo no servidor, então o cliente pode parar e continuar
 * de onde parou, em qualquer aparelho, enquanto a referência existir.
 *
 * Variáveis: RESEND_API_KEY (obrigatória), RESEND_FROM e RESEND_REPLY_TO
 * (opcionais). Falha no envio nunca bloqueia a liberação do acesso.
 */

import { store } from './store.js';
import { log } from './security.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SITE = 'https://ymnegocios.com.br';
const FROM_PADRAO = 'YM Marketing & Negócios <acesso@ymnegocios.com.br>';

export const temResend = () => Boolean((process.env.RESEND_API_KEY || '').trim());

function emailValido(v) {
  return typeof v === 'string' && v.length <= 240 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function linkAcesso(ref) {
  return `${SITE}/raio-x-app.html?ref=${encodeURIComponent(ref)}`;
}

function primeiroNome(nome) {
  const n = String(nome || '').trim().split(/\s+/)[0] || '';
  if (!n || /^cliente$/i.test(n)) return '';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

function montar(ref, registro) {
  const link = linkAcesso(ref);
  const nome = primeiroNome(registro.customerName);
  const ola = nome ? `Olá, ${nome}.` : 'Olá.';
  const subject = 'Seu Raio-X Digital está liberado: guarde este link';
  const text = [
    ola,
    '',
    'Seu pagamento foi confirmado e o seu Raio-X Digital está liberado.',
    '',
    'Acesse pelo seu link pessoal:',
    link,
    '',
    'Pode responder com calma. O progresso é salvo automaticamente: se precisar parar, é só abrir este mesmo link depois (no celular ou no computador) e continuar de onde parou.',
    '',
    'Guarde este e-mail. O link é pessoal e dá acesso às suas respostas, então não compartilhe.',
    '',
    'Qualquer dúvida, é só responder este e-mail.',
    '',
    'YM Marketing & Negócios',
  ].join('\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#0B1533"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #dce5f0"><tr><td style="background:#0B1533;color:#fff;padding:28px 32px"><b style="letter-spacing:.1em;font-size:12px">YM MARKETING &amp; NEGÓCIOS · RAIO-X DIGITAL</b><div style="font-size:26px;font-weight:800;margin-top:10px;line-height:1.2">Seu Raio-X está liberado</div></td></tr><tr><td style="padding:32px"><p style="line-height:1.6;margin-top:0">${esc(ola)}</p><p style="line-height:1.6">Seu pagamento foi confirmado. Clique no botão para começar ou continuar o seu Raio-X Digital.</p><p style="margin:26px 0"><a href="${esc(link)}" style="display:inline-block;background:#FF7A1A;color:#fff;text-decoration:none;padding:15px 24px;border-radius:10px;font-weight:800">Abrir meu Raio-X</a></p><div style="background:#f3f6fb;border-radius:14px;padding:18px;line-height:1.6;font-size:15px"><b>Pode parar e voltar quando quiser.</b><br>O progresso é salvo automaticamente. Abra este mesmo link depois, no celular ou no computador, e você continua de onde parou.</div><p style="font-size:13px;color:#52697e;line-height:1.6;margin:22px 0 0">Guarde este e-mail. O link é pessoal e dá acesso às suas respostas, então não compartilhe.<br>Se o botão não abrir, copie e cole no navegador:<br><a href="${esc(link)}" style="color:#3B4BD8;word-break:break-all">${esc(link)}</a></p><p style="font-size:12px;color:#8090a0;line-height:1.5;margin:24px 0 0">Este é um e-mail transacional sobre a sua compra do Raio-X Digital na YM Marketing &amp; Negócios.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/**
 * Envia o e-mail de acesso se ainda não foi enviado para esta referência.
 * Devolve o registro (atualizado quando o envio dá certo).
 */
export async function enviarEmailAcesso(ref, registro) {
  try {
    if (!registro || registro.status !== 'approved') return registro;
    if (registro.emailAcessoEnviadoEm) return registro;
    const para = String(registro.customerEmail || '').trim().toLowerCase();
    if (!emailValido(para)) return registro;
    if (!temResend()) {
      log('warn', 'RESEND_API_KEY ausente: e-mail de acesso não enviado.', { ref });
      return registro;
    }
    // trava curta contra envio duplo (webhook e status ao mesmo tempo)
    const n = await store.incr(`ym:mailacesso:${ref}`, 60);
    if (n > 1) return registro;

    const { subject, text, html } = montar(ref, registro);
    const corpo = {
      from: (process.env.RESEND_FROM || '').trim() || FROM_PADRAO,
      to: [para],
      subject,
      text,
      html,
      tags: [{ name: 'tipo', value: 'raiox_acesso' }],
    };
    const replyTo = (process.env.RESEND_REPLY_TO || '').trim();
    if (replyTo) corpo.reply_to = replyTo;

    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `raiox-acesso/${ref}`,
      },
      body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      log('error', 'Resend recusou o e-mail de acesso.', { ref, http: r.status, erro: d?.name || d?.message || null });
      return registro;
    }
    const atualizado = await store.atualizar(ref, {
      emailAcessoEnviadoEm: new Date().toISOString(),
      emailAcessoId: d?.id || null,
    });
    log('info', 'E-mail de acesso enviado.', { ref, emailId: d?.id || null });
    return atualizado;
  } catch (e) {
    log('error', 'Falha ao enviar e-mail de acesso.', { ref, motivo: e.message });
    return registro;
  }
}
