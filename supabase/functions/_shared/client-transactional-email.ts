const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const PORTAL_URL = 'https://ymnegocios.com.br/areadocliente';
const FROM = 'Central YM <acesso@ymnegocios.com.br>';

type EmailKind = 'AGENDA' | 'APROVACAO' | 'ARQUIVO';

type SendInput = {
  sb: any;
  clientId: string;
  kind: EmailKind;
  resourceType: string;
  resourceId: string;
  title: string;
  description?: string | null;
  scheduledAt?: string | null;
  externalUrl?: string | null;
  portalHash: 'calendario' | 'aprovacoes' | 'documentos';
  allowCancellation?: boolean;
};

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character] || character));
}

function validEmail(value: unknown) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.length <= 240;
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone:'America/Sao_Paulo', dateStyle:'full', timeStyle:'short'
  }).format(date);
}

async function fingerprint(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function copy(kind: EmailKind) {
  if (kind === 'APROVACAO') return { eyebrow:'APROVAÇÃO', heading:'Um conteúdo aguarda sua aprovação', subject:'Novo conteúdo para aprovação' };
  if (kind === 'ARQUIVO') return { eyebrow:'NOVO ARQUIVO', heading:'Um novo arquivo está disponível', subject:'Novo arquivo disponível' };
  return { eyebrow:'AGENDA', heading:'Um novo compromisso foi agendado', subject:'Novo compromisso agendado' };
}

function emailHtml(input: SendInput, clientName: string, portalUrl: string) {
  const labels = copy(input.kind);
  const when = formatDateTime(input.scheduledAt);
  const cancellation = input.allowCancellation
    ? 'Se você não puder participar, abra o calendário no portal e use <b>Cancelar compromisso</b>. O cancelamento ficará registrado para a equipe YM.'
    : 'Abra o portal para consultar os detalhes e realizar a ação necessária.';
  const external = input.externalUrl
    ? `<p style="margin:18px 0 0"><a href="${escapeHtml(input.externalUrl)}" style="color:#484DCF;font-weight:700">Abrir link relacionado</a></p>`
    : '';
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#102b45"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #dce5f0"><tr><td style="background:#0A2540;color:#fff;padding:28px 32px"><b style="letter-spacing:.1em;font-size:12px">YM MARKETING &amp; NEGÓCIOS · ${labels.eyebrow}</b><div style="font-size:26px;font-weight:800;margin-top:10px">${labels.heading}</div></td></tr><tr><td style="padding:32px"><p style="line-height:1.6;margin-top:0">Olá, <b>${escapeHtml(clientName)}</b>.</p><div style="background:#f3f6fb;border-radius:14px;padding:18px"><div style="font-size:18px;font-weight:800">${escapeHtml(input.title)}</div>${when ? `<div style="margin-top:8px;color:#52697e"><b>Data e horário:</b> ${escapeHtml(when)}</div>` : ''}${input.description ? `<div style="margin-top:8px;color:#52697e;line-height:1.5">${escapeHtml(input.description)}</div>` : ''}${external}</div><p style="font-size:14px;color:#52697e;line-height:1.6;margin:22px 0">${cancellation}</p><a href="${portalUrl}" style="display:inline-block;background:#0066FF;color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:800">Abrir minha Central YM</a><p style="font-size:12px;color:#8090a0;line-height:1.5;margin:24px 0 0">Este é um aviso transacional relacionado ao seu atendimento com a YM.</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendClientTransactionalEmail(input: SendInput) {
  const portalUrl = `${PORTAL_URL}#${input.portalHash}`;
  const identity = await fingerprint(`${input.kind}|${input.resourceType}|${input.resourceId}|${input.scheduledAt || ''}|${input.title}|${input.externalUrl || ''}`);
  const idempotencyKey = `central-ym/${input.kind.toLowerCase()}/${input.resourceId}/${identity}`;

  const clientQuery = await input.sb.from('crm_clients')
    .select('id,contact:crm_contacts(name,business_name,email)')
    .eq('id', input.clientId).maybeSingle();
  if (clientQuery.error) throw clientQuery.error;
  const contact = Array.isArray(clientQuery.data?.contact) ? clientQuery.data.contact[0] : clientQuery.data?.contact;
  let recipient = validEmail(contact?.email) ? String(contact.email).trim().toLowerCase() : '';
  if (!recipient) {
    const access = await input.sb.from('client_portal_access').select('email').eq('client_id', input.clientId).eq('active', true).order('created_at').limit(1).maybeSingle();
    if (access.error) throw access.error;
    if (validEmail(access.data?.email)) recipient = String(access.data.email).trim().toLowerCase();
  }

  if (recipient) {
    const preference = await input.sb.from('client_communication_preferences').select('transactional_email').eq('client_id', input.clientId).ilike('email', recipient).maybeSingle();
    if (preference.error) throw preference.error;
    if (preference.data?.transactional_email === false) recipient = '';
  }

  const pending = await input.sb.from('client_email_deliveries').insert({
    client_id:input.clientId,
    recipient_email:recipient || null,
    notification_kind:input.kind,
    resource_type:input.resourceType,
    resource_id:input.resourceId,
    idempotency_key:idempotencyKey,
    status:recipient ? 'PENDING' : 'SKIPPED',
    error_code:recipient ? null : 'NO_TRANSACTIONAL_EMAIL',
    metadata:{ title:input.title, scheduled_at:input.scheduledAt || null, portal_url:portalUrl }
  }).select('id,status,provider_message_id,error_code').single();

  if (pending.error?.code === '23505') {
    const existing = await input.sb.from('client_email_deliveries').select('id,status,provider_message_id,error_code').eq('idempotency_key', idempotencyKey).maybeSingle();
    if (existing.error) throw existing.error;
    return { status:'DUPLICATE', delivery:existing.data };
  }
  if (pending.error) throw pending.error;
  if (!recipient) return { status:'SKIPPED', reason:'NO_TRANSACTIONAL_EMAIL', delivery:pending.data };

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    await input.sb.from('client_email_deliveries').update({ status:'FAILED', error_code:'RESEND_NOT_CONFIGURED', updated_at:new Date().toISOString() }).eq('id', pending.data.id);
    return { status:'FAILED', reason:'RESEND_NOT_CONFIGURED' };
  }

  const labels = copy(input.kind);
  const clientName = contact?.business_name || contact?.name || 'cliente';
  const response = await fetch(RESEND_ENDPOINT, {
    method:'POST',
    headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json', 'Idempotency-Key':idempotencyKey },
    body:JSON.stringify({
      from:FROM,
      to:[recipient],
      subject:`${labels.subject} · ${input.title}`.slice(0, 180),
      html:emailHtml(input, clientName, portalUrl),
      text:`${labels.heading}\n\n${input.title}${input.scheduledAt ? `\n${formatDateTime(input.scheduledAt)}` : ''}${input.description ? `\n${input.description}` : ''}\n\nAcesse: ${portalUrl}`
    })
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorCode = String(responseBody?.name || responseBody?.message || `HTTP_${response.status}`).slice(0, 300);
    await input.sb.from('client_email_deliveries').update({ status:'FAILED', error_code:errorCode, updated_at:new Date().toISOString() }).eq('id', pending.data.id);
    console.error('resend transactional email', response.status, errorCode);
    return { status:'FAILED', reason:errorCode };
  }

  await input.sb.from('client_email_deliveries').update({
    status:'SENT', provider_message_id:responseBody?.id || null, sent_at:new Date().toISOString(), updated_at:new Date().toISOString()
  }).eq('id', pending.data.id);
  return { status:'SENT', provider_message_id:responseBody?.id || null, recipient };
}
