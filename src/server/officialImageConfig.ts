import type { EnvLike } from './proxy';

export const OFFICIAL_IMAGES_ENV_KEYS = ['OPENAI_IMAGES_BASE_URL', 'OPENAI_IMAGES_API_KEY', 'OPENAI_IMAGES_HTTPS_PROXY', 'OPENAI_IMAGES_PROXY_ENABLED', 'OPENAI_IMAGES_STREAM', 'OPENAI_IMAGES_REQUEST_TIMEOUT_MS', 'OPENAI_IMAGES_ORGANIZATION', 'OPENAI_IMAGES_PROJECT'] as const;
export type OfficialImageConnection = {
  baseUrl: string; apiKey: string; proxyUrl: string; proxyEnabled: boolean; stream: boolean;
  requestTimeoutMs: number; organization: string; project: string;
};
export function createOfficialImageConnection(env: EnvLike): OfficialImageConnection {
  return { baseUrl: (env.OPENAI_IMAGES_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: env.OPENAI_IMAGES_API_KEY?.trim() || '', proxyUrl: env.OPENAI_IMAGES_HTTPS_PROXY?.trim() || '',
    proxyEnabled: /^(true|1|yes)$/i.test(env.OPENAI_IMAGES_PROXY_ENABLED ?? ''),
    stream: !/^(false|0|no)$/i.test(env.OPENAI_IMAGES_STREAM ?? 'true'),
    requestTimeoutMs: Number(env.OPENAI_IMAGES_REQUEST_TIMEOUT_MS) || 600000,
    organization: env.OPENAI_IMAGES_ORGANIZATION?.trim() || '', project: env.OPENAI_IMAGES_PROJECT?.trim() || '' };
}
