import { Agent, ProxyAgent } from 'undici';
import {
  resolveImage2AllowH2,
  resolveImage2ProxyMode,
} from '../lib/imageModels';

export type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown };
export type EnvLike = Record<string, string | undefined>;

export const DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS = 240_000;
export const DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS = 60_000;

let proxyAgent: ProxyAgent | null = null;
let proxyAgentUrl = '';
let image2DirectAgent: Agent | null = null;

export function getConfiguredProxyUrl(env: EnvLike = process.env) {
  return env.IMAGE2_HTTPS_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY || '';
}

export function getImage2ProxyMode(proxyUrl = getConfiguredProxyUrl(), env: EnvLike = process.env) {
  return resolveImage2ProxyMode(env.IMAGE2_PROXY_MODE, Boolean(proxyUrl));
}

export function readPositiveIntEnv(
  env: EnvLike,
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;

  return Math.min(Math.floor(value), max);
}

export function readNonNegativeIntEnv(
  env: EnvLike,
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;

  return Math.min(Math.floor(value), max);
}

export function readBooleanEnv(env: EnvLike, name: string, fallback = false) {
  const normalized = env[name]?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

export function redactProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '[invalid proxy url]';
  }
}

export function getProxyAgent(proxyUrl: string, env: EnvLike = process.env) {
  if (!proxyAgent || proxyAgentUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent({
      uri: proxyUrl,
      connectTimeout: readPositiveIntEnv(
        env,
        'IMAGE2_PROXY_CONNECT_TIMEOUT_MS',
        DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS
      ),
      headersTimeout: readPositiveIntEnv(
        env,
        'IMAGE2_REQUEST_TIMEOUT_MS',
        DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS
      ),
      bodyTimeout: readPositiveIntEnv(
        env,
        'IMAGE2_REQUEST_TIMEOUT_MS',
        DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS
      ),
    });
    proxyAgentUrl = proxyUrl;
  }

  return proxyAgent;
}

export function getImage2DirectAgent(env: EnvLike = process.env) {
  const requestTimeoutMs = readPositiveIntEnv(
    env,
    'IMAGE2_REQUEST_TIMEOUT_MS',
    DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS
  );
  const connectTimeoutMs = readPositiveIntEnv(
    env,
    'IMAGE2_DIRECT_CONNECT_TIMEOUT_MS',
    DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS
  );
  const allowH2 = resolveImage2AllowH2(env.IMAGE2_DIRECT_ALLOW_H2);

  if (!image2DirectAgent) {
    image2DirectAgent = new Agent({
      allowH2,
      connectTimeout: connectTimeoutMs,
      headersTimeout: requestTimeoutMs,
      bodyTimeout: requestTimeoutMs,
    });
  }

  return image2DirectAgent;
}

export function applyGlobalProxyFetch({
  proxyUrl,
  directFetch = globalThis.fetch.bind(globalThis),
}: {
  proxyUrl: string;
  directFetch?: typeof fetch;
}) {
  const agent = getProxyAgent(proxyUrl);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    return directFetch(input, { ...(init ?? {}), dispatcher: agent } as FetchInitWithDispatcher);
  };
}
