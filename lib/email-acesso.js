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
  const LOGO = `${SITE}/assets/img/email/logo-ym-branca-email.png`;
  const F = "font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif;";
  const H = "font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;";
  const passo = (n, titulo, desc) => `<tr><td valign="top" width="40" style="padding:0 0 16px"><div style="width:28px;height:28px;line-height:28px;border-radius:14px;background:#484DCF;color:#FFFFFF;text-align:center;font-weight:800;font-size:14px;${F}">${n}</div></td><td valign="top" style="padding:3px 0 16px;${F}font-size:15px;line-height:1.5;color:#12143A"><b>${titulo}</b><br><span style="color:#686C8A">${desc}</span></td></tr>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F5FB;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Seu pagamento foi confirmado. Guarde este link: ele abre o seu Raio-X de onde você parou.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F5FB"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid #E2E4F3">
<tr><td align="center" bgcolor="#0B1533" style="background:#0B1533;padding:30px 24px 26px"><img src="${LOGO}" width="200" height="63" alt="Yasmin Menezes · Marketing &amp; Negócios" style="display:block;border:0;width:200px;height:auto;color:#FFFFFF;${F}font-size:16px;font-weight:700"></td></tr>
<tr><td height="4" style="background:#FF7A00;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:36px 36px 8px">
<div style="${F}font-size:12px;font-weight:700;letter-spacing:.12em;color:#484DCF;text-transform:uppercase">Raio-X Digital · Método VOS</div>
<h1 style="margin:10px 0 0;${H}font-size:28px;line-height:1.2;font-weight:800;color:#12143A">Seu Raio-X está liberado</h1>
<p style="margin:16px 0 0;${F}font-size:16px;line-height:1.6;color:#12143A">${esc(ola)} Seu pagamento foi confirmado. A partir daqui, você vai enxergar onde a jornada do seu cliente quebra e o que corrigir primeiro.</p>
</td></tr>
<tr><td align="center" style="padding:26px 36px 6px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#FF7A00" style="border-radius:12px;background:#FF7A00"><a href="${esc(link)}" target="_blank" style="display:inline-block;padding:16px 34px;${H}font-size:16px;font-weight:800;color:#0B1533;text-decoration:none;border-radius:12px">Abrir meu Raio-X &rarr;</a></td></tr></table>
<div style="margin-top:10px;${F}font-size:13px;color:#686C8A">Este link é seu. Funciona no celular e no computador.</div>
</td></tr>
<tr><td style="padding:24px 36px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ECEDFC;border-radius:14px"><tr><td style="padding:22px 22px 6px">
<div style="${H}font-size:15px;font-weight:800;color:#12143A;margin-bottom:14px">Como funciona</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${passo(1, 'Responda com calma', 'Quanto mais contexto você der, mais preciso fica o diagnóstico.')}
${passo(2, 'Pode parar e voltar quando quiser', 'O progresso é salvo sozinho. Abra este mesmo link e continue de onde parou.')}
${passo(3, 'Receba o seu relatório', 'Ao concluir, o relatório sai na hora, e a reunião com a YM está incluída.')}
</table>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 36px 30px;${F}font-size:13px;line-height:1.6;color:#686C8A">
<b style="color:#12143A">Guarde este e-mail.</b> O link dá acesso às suas respostas, por isso não compartilhe.<br>
Se o botão não abrir, copie e cole no navegador:<br>
<a href="${esc(link)}" style="color:#484DCF;word-break:break-all">${esc(link)}</a><br><br>
Ficou com alguma dúvida? É só responder este e-mail.
</td></tr>
<tr><td bgcolor="#0B1533" style="background:#0B1533;padding:20px 36px;${F}font-size:12px;line-height:1.6;color:#C3C8E0" align="center">
<b style="color:#FFFFFF">YM Marketing &amp; Negócios</b> · Belo Horizonte (MG)<br>
<a href="${SITE}/" style="color:#FF9A3D;text-decoration:none">ymnegocios.com.br</a><br>
<span style="color:#8B91B5">E-mail transacional sobre a sua compra do Raio-X Digital.</span>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
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
