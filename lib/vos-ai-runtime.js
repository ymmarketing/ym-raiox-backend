import { getVercelOidcToken } from '@vercel/oidc';

export const AI_GATEWAY_RESPONSES_URL = 'https://ai-gateway.vercel.sh/v1/responses';
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const deployedOnVercel = Boolean(process.env.VERCEL_ENV || process.env.VERCEL === '1');

export const temVosAiRuntime = Boolean(
  process.env.AI_GATEWAY_API_KEY || deployedOnVercel || process.env.OPENAI_API_KEY,
);

function gatewayModel(model) {
  const value = String(model || 'gpt-5.6-terra').trim();
  return value.includes('/') ? value : `openai/${value}`;
}

function directOpenAiModel(model) {
  const value = String(model || 'gpt-5.6-terra').trim();
  return value.startsWith('openai/') ? value.slice('openai/'.length) : value;
}

export async function resolveVosAiRuntime({
  model,
  openai_key = process.env.OPENAI_API_KEY || '',
  gateway_key = process.env.AI_GATEWAY_API_KEY || '',
  prefer_gateway = true,
} = {}) {
  if (prefer_gateway && (gateway_key || deployedOnVercel)) {
    try {
      const token = gateway_key || await getVercelOidcToken({ expirationBufferMs: 60_000 });
      if (token) {
        return {
          provider: 'vercel_ai_gateway',
          endpoint: AI_GATEWAY_RESPONSES_URL,
          token,
          model: gatewayModel(model),
        };
      }
    } catch (error) {
      if (!openai_key) throw new Error(`AI_GATEWAY_AUTH_FAILED: ${String(error?.message || error)}`);
    }
  }

  if (openai_key) {
    return {
      provider: 'openai_direct',
      endpoint: OPENAI_RESPONSES_URL,
      token: openai_key,
      model: directOpenAiModel(model),
    };
  }

  throw new Error('Nenhuma credencial de IA disponível. Configure AI Gateway no projeto Vercel ou OPENAI_API_KEY.');
}
