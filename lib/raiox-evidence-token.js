import crypto from 'node:crypto';

const SECRET = process.env.RAIOX_EVIDENCE_HMAC_SECRET || '';
const TTL_SECONDS = Math.max(60, Math.min(Number(process.env.RAIOX_EVIDENCE_TOKEN_TTL || 600), 1800));

export const evidenceTokenConfigured = Boolean(SECRET && SECRET.length >= 32);

function b64url(input) {
  return Buffer.from(typeof input === 'string' ? input : JSON.stringify(input), 'utf8').toString('base64url');
}

export function mintEvidenceToken({ ref, maxFiles = 5 }) {
  if (!evidenceTokenConfigured) throw new Error('evidence_secret_ausente');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 'RX_EVIDENCE_TOKEN_1.0',
    ref,
    iat: now,
    exp: now + TTL_SECONDS,
    max_files: Math.max(1, Math.min(Number(maxFiles) || 5, 5)),
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const body = b64url(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return { token: `${body}.${sig}`, expires_at: new Date(payload.exp * 1000).toISOString() };
}
