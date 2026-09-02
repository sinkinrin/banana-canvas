import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  createImage2Config,
  resolveImage2AllowH2,
  resolveImage2HedgeEnabled,
  resolveImage2ProxyMode,
  type Image2EndpointType,
  type Image2ProxyMode,
} from '../lib/imageModels';
import type { EnvLike } from './proxy';

const DEFAULT_PORT = 3000;
const DEFAULT_DATA_DIR = 'data';
const DEFAULT_IMAGE2_MAX_ATTEMPTS = 1;
const DEFAULT_IMAGE2_RETRY_DELAY_MS = 1_000;
const DEFAULT_IMAGE2_STREAM_PARTIAL_IMAGES = 1;
const DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS = 240_000;
const DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS = 60_000;

const STARTUP_ENV_KEYS = ['PORT', 'NODE_ENV', 'BANANA_DATA_DIR'] as const;

const RUNTIME_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_HTTPS_PROXY',
  'GEMINI_PROXY_ENABLED',
  'IMAGE2_BASE_URL',
  'IMAGE2_CHAT_COMPLETIONS_URL',
  'IMAGE2_API_KEY',
  'IMAGE2_MODEL',
  'IMAGE2_ENDPOINT_TYPE',
  'IMAGE2_STREAM',
  'IMAGE2_PARTIAL_IMAGES',
  'IMAGE2_PROXY_MODE',
  'IMAGE2_HTTPS_PROXY',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'IMAGE2_MAX_ATTEMPTS',
  'IMAGE2_RETRY_DELAY_MS',
  'IMAGE2_REQUEST_TIMEOUT_MS',
  'IMAGE2_PROXY_CONNECT_TIMEOUT_MS',
  'IMAGE2_DIRECT_CONNECT_TIMEOUT_MS',
  'IMAGE2_DIRECT_ALLOW_H2',
  'IMAGE2_HEDGE_ENABLED',
  ...STARTUP_ENV_KEYS,
] as const;

type RuntimeEnvKey = (typeof RUNTIME_ENV_KEYS)[number];

type ValidationSuccess = {
  ok: true;
  config: RuntimeConfig;
};

type ValidationFailure = {
  ok: false;
  errors: string[];
};

export type RuntimeConfigLogEntry = {
  level: 'info' | 'warn' | 'error';
  message: string;
};

export type RuntimeConfigLogger = (entry: RuntimeConfigLogEntry) => void;

export type RuntimeConfig = {
  env: EnvLike;
  geminiApiKey: string;
  geminiProxyUrl: string;
  geminiProxyEnabled: boolean;
  startup: {
    port: number;
    nodeEnv: string;
    dataDir: string;
  };
  image2: {
    baseUrl: string;
    apiKey: string;
    model: string;
    endpointType: Image2EndpointType;
    missingKeys: string[];
    proxyUrl: string;
    proxyMode: Image2ProxyMode;
    stream: boolean;
    partialImages: number;
    maxAttempts: number;
    retryDelayMs: number;
    requestTimeoutMs: number;
    proxyConnectTimeoutMs: number;
    directConnectTimeoutMs: number;
    directAllowH2: boolean;
    hedgeEnabled: boolean;
  };
};

export type RuntimeConfigReloadResult =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; errors: string[]; config: RuntimeConfig };

export type RuntimeConfigManager = {
  get: () => RuntimeConfig;
  reload: (env: EnvLike) => RuntimeConfigReloadResult;
};

export type RuntimeEnvFilePrecedence = 'base' | 'file';

export type RuntimeEnvRecoveryResult = {
  env: EnvLike;
  errors: string[];
  invalidKeys: string[];
};

export type RuntimeEnvFileRepairResult = RuntimeEnvRecoveryResult & {
  repaired: boolean;
};

function defaultLogger(entry: RuntimeConfigLogEntry) {
  if (entry.level === 'error') {
    console.error(entry.message);
    return;
  }
  if (entry.level === 'warn') {
    console.warn(entry.message);
    return;
  }
  console.info(entry.message);
}

function trimEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeRelevantEnv(env: EnvLike) {
  const normalized: EnvLike = {};
  for (const key of RUNTIME_ENV_KEYS) {
    const value = trimEnvValue(env[key]);
    if (value !== undefined) normalized[key] = value;
  }
  return normalized;
}

function validateUrlField(env: EnvLike, key: RuntimeEnvKey, errors: string[]) {
  const value = env[key];
  if (!value) return;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors.push(`${key} must use http or https`);
    }
  } catch {
    errors.push(`${key} must be a valid URL`);
  }
}

function validateEnumField<T extends readonly string[]>(
  env: EnvLike,
  key: RuntimeEnvKey,
  allowed: T,
  errors: string[]
) {
  const value = env[key];
  if (!value) return;
  if (!allowed.includes(value.toLowerCase())) {
    errors.push(`${key} must be one of ${allowed.join(', ')}`);
  }
}

function parseBooleanField(
  env: EnvLike,
  key: RuntimeEnvKey,
  fallback: boolean,
  errors: string[]
) {
  const normalized = env[key]?.toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  errors.push(`${key} must be a boolean`);
  return fallback;
}

function normalizeBooleanField(env: EnvLike, key: RuntimeEnvKey, value: boolean) {
  if (env[key] !== undefined) env[key] = value ? 'true' : 'false';
}

function parseIntegerField({
  env,
  key,
  fallback,
  min,
  max = Number.MAX_SAFE_INTEGER,
  errors,
}: {
  env: EnvLike;
  key: RuntimeEnvKey;
  fallback: number;
  min: number;
  max?: number;
  errors: string[];
}) {
  const raw = env[key];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${key} must be an integer between ${min} and ${max}`);
    return fallback;
  }

  return value;
}

function normalizeIntegerField(env: EnvLike, key: RuntimeEnvKey, value: number) {
  if (env[key] !== undefined) env[key] = String(value);
}

function resolveDataDir(value: string | undefined) {
  return value ? path.resolve(value) : path.join(process.cwd(), DEFAULT_DATA_DIR);
}

function getConfiguredProxyUrlFromEnv(env: EnvLike) {
  return env.IMAGE2_HTTPS_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY || '';
}

function validateRuntimeEnv(envInput: EnvLike): ValidationSuccess | ValidationFailure {
  const env = normalizeRelevantEnv(envInput);
  const errors: string[] = [];

  validateUrlField(env, 'IMAGE2_BASE_URL', errors);
  validateUrlField(env, 'IMAGE2_CHAT_COMPLETIONS_URL', errors);
  validateUrlField(env, 'IMAGE2_HTTPS_PROXY', errors);
  validateUrlField(env, 'HTTPS_PROXY', errors);
  validateUrlField(env, 'HTTP_PROXY', errors);
  validateUrlField(env, 'GEMINI_HTTPS_PROXY', errors);
  validateEnumField(env, 'IMAGE2_ENDPOINT_TYPE', ['chat', 'images'] as const, errors);
  validateEnumField(env, 'IMAGE2_PROXY_MODE', ['direct', 'auto', 'proxy'] as const, errors);

  const port = parseIntegerField({
    env,
    key: 'PORT',
    fallback: DEFAULT_PORT,
    min: 1,
    max: 65_535,
    errors,
  });
  const stream = parseBooleanField(env, 'IMAGE2_STREAM', false, errors);
  const directAllowH2 = parseBooleanField(env, 'IMAGE2_DIRECT_ALLOW_H2', true, errors);
  const hedgeEnabled = parseBooleanField(env, 'IMAGE2_HEDGE_ENABLED', false, errors);
  const geminiProxyEnabled = parseBooleanField(env, 'GEMINI_PROXY_ENABLED', false, errors);
  const partialImages = parseIntegerField({
    env,
    key: 'IMAGE2_PARTIAL_IMAGES',
    fallback: DEFAULT_IMAGE2_STREAM_PARTIAL_IMAGES,
    min: 0,
    max: 3,
    errors,
  });
  const maxAttempts = parseIntegerField({
    env,
    key: 'IMAGE2_MAX_ATTEMPTS',
    fallback: DEFAULT_IMAGE2_MAX_ATTEMPTS,
    min: 1,
    max: 8,
    errors,
  });
  const retryDelayMs = parseIntegerField({
    env,
    key: 'IMAGE2_RETRY_DELAY_MS',
    fallback: DEFAULT_IMAGE2_RETRY_DELAY_MS,
    min: 1,
    max: 30_000,
    errors,
  });
  const requestTimeoutMs = parseIntegerField({
    env,
    key: 'IMAGE2_REQUEST_TIMEOUT_MS',
    fallback: DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS,
    min: 1,
    errors,
  });
  const proxyConnectTimeoutMs = parseIntegerField({
    env,
    key: 'IMAGE2_PROXY_CONNECT_TIMEOUT_MS',
    fallback: DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS,
    min: 1,
    errors,
  });
  const directConnectTimeoutMs = parseIntegerField({
    env,
    key: 'IMAGE2_DIRECT_CONNECT_TIMEOUT_MS',
    fallback: DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS,
    min: 1,
    errors,
  });
  if (geminiProxyEnabled && !env.GEMINI_HTTPS_PROXY) {
    errors.push('GEMINI_PROXY_ENABLED requires GEMINI_HTTPS_PROXY');
  }

  if (errors.length > 0) return { ok: false, errors };

  normalizeIntegerField(env, 'PORT', port);
  normalizeIntegerField(env, 'IMAGE2_PARTIAL_IMAGES', partialImages);
  normalizeIntegerField(env, 'IMAGE2_MAX_ATTEMPTS', maxAttempts);
  normalizeIntegerField(env, 'IMAGE2_RETRY_DELAY_MS', retryDelayMs);
  normalizeIntegerField(env, 'IMAGE2_REQUEST_TIMEOUT_MS', requestTimeoutMs);
  normalizeIntegerField(env, 'IMAGE2_PROXY_CONNECT_TIMEOUT_MS', proxyConnectTimeoutMs);
  normalizeIntegerField(env, 'IMAGE2_DIRECT_CONNECT_TIMEOUT_MS', directConnectTimeoutMs);
  normalizeBooleanField(env, 'IMAGE2_STREAM', stream);
  normalizeBooleanField(env, 'IMAGE2_DIRECT_ALLOW_H2', directAllowH2);
  normalizeBooleanField(env, 'IMAGE2_HEDGE_ENABLED', hedgeEnabled);
  normalizeBooleanField(env, 'GEMINI_PROXY_ENABLED', geminiProxyEnabled);

  const image2Config = createImage2Config(env);
  const proxyUrl = getConfiguredProxyUrlFromEnv(env);
  const proxyMode = resolveImage2ProxyMode(env.IMAGE2_PROXY_MODE, Boolean(proxyUrl));

  return {
    ok: true,
    config: {
      env,
      geminiApiKey: env.GEMINI_API_KEY ?? '',
      geminiProxyUrl: env.GEMINI_HTTPS_PROXY ?? '',
      geminiProxyEnabled: geminiProxyEnabled && Boolean(env.GEMINI_HTTPS_PROXY),
      startup: {
        port,
        nodeEnv: env.NODE_ENV ?? '',
        dataDir: resolveDataDir(env.BANANA_DATA_DIR),
      },
      image2: {
        baseUrl: image2Config.baseUrl,
        apiKey: image2Config.apiKey,
        model: image2Config.model,
        endpointType: image2Config.endpointType,
        missingKeys: image2Config.missingKeys,
        proxyUrl,
        proxyMode,
        stream,
        partialImages,
        maxAttempts,
        retryDelayMs,
        requestTimeoutMs,
        proxyConnectTimeoutMs,
        directConnectTimeoutMs,
        directAllowH2: resolveImage2AllowH2(env.IMAGE2_DIRECT_ALLOW_H2),
        hedgeEnabled: resolveImage2HedgeEnabled(env.IMAGE2_HEDGE_ENABLED),
      },
    },
  };
}

function getValidationErrorKey(error: string) {
  return RUNTIME_ENV_KEYS.find((key) => error.startsWith(`${key} `));
}

export function recoverInvalidRuntimeEnv(envInput: EnvLike): RuntimeEnvRecoveryResult {
  const candidate = { ...envInput };
  const errors: string[] = [];
  const invalidKeys = new Set<string>();

  for (let attempt = 0; attempt <= RUNTIME_ENV_KEYS.length; attempt += 1) {
    const result = validateRuntimeEnv(candidate);
    if (result.ok) {
      return {
        env: result.config.env,
        errors,
        invalidKeys: [...invalidKeys],
      };
    }

    let removedAny = false;
    for (const error of result.errors) {
      if (!errors.includes(error)) errors.push(error);
      const key = getValidationErrorKey(error);
      if (!key) continue;
      invalidKeys.add(key);
      delete candidate[key];
      removedAny = true;
    }

    if (!removedAny) break;
  }

  return { env: {}, errors, invalidKeys: [...invalidKeys] };
}

function getChangedStartupKeys(previous: RuntimeConfig, next: RuntimeConfig) {
  const changed: string[] = [];
  if (previous.startup.port !== next.startup.port) changed.push('PORT');
  if (previous.startup.nodeEnv !== next.startup.nodeEnv) changed.push('NODE_ENV');
  if (previous.startup.dataDir !== next.startup.dataDir) changed.push('BANANA_DATA_DIR');
  return changed;
}

function preserveStartupConfig(previous: RuntimeConfig, next: RuntimeConfig): RuntimeConfig {
  const env = { ...next.env };
  for (const key of STARTUP_ENV_KEYS) {
    if (previous.env[key] === undefined) {
      delete env[key];
    } else {
      env[key] = previous.env[key];
    }
  }

  return {
    ...next,
    env,
    startup: previous.startup,
  };
}

export function createRuntimeConfigManager(
  initialEnv: EnvLike,
  { logger = defaultLogger }: { logger?: RuntimeConfigLogger } = {}
): RuntimeConfigManager {
  const initial = validateRuntimeEnv(initialEnv);
  if (!initial.ok) {
    throw new Error(`Invalid runtime env: ${initial.errors.join('; ')}`);
  }

  let current = initial.config;

  return {
    get: () => current,
    reload: (env: EnvLike) => {
      const next = validateRuntimeEnv(env);
      if (!next.ok) {
        logger({
          level: 'error',
          message: `Runtime env reload rejected: ${next.errors.join('; ')}`,
        });
        return { ok: false, errors: next.errors, config: current };
      }

      const changedStartupKeys = getChangedStartupKeys(current, next.config);
      current = changedStartupKeys.length > 0
        ? preserveStartupConfig(current, next.config)
        : next.config;

      if (changedStartupKeys.length > 0) {
        logger({
          level: 'warn',
          message: `Runtime env reload accepted, but restart required for startup-only changes: ${changedStartupKeys.join(', ')}`,
        });
      } else {
        logger({ level: 'info', message: 'Runtime env reloaded' });
      }

      return { ok: true, config: current };
    },
  };
}

let defaultRuntimeConfigManager: RuntimeConfigManager | undefined;

export function getRuntimeConfigManager() {
  defaultRuntimeConfigManager ??= createRuntimeConfigManager(process.env);
  return defaultRuntimeConfigManager;
}

export function getRuntimeConfig() {
  return getRuntimeConfigManager().get();
}

function readDotEnvFile(envFilePath: string) {
  if (!fs.existsSync(envFilePath)) return {};
  return dotenv.parse(fs.readFileSync(envFilePath));
}

export function loadRuntimeEnvFile(
  envFilePath: string,
  baseEnv: EnvLike,
  precedence: RuntimeEnvFilePrecedence = 'base'
) {
  const parsed = readDotEnvFile(envFilePath);
  return precedence === 'file'
    ? { ...baseEnv, ...parsed }
    : { ...parsed, ...baseEnv };
}

function clearInvalidEnvFileKeys(text: string, invalidKeys: string[]) {
  const keys = new Set(invalidKeys);
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      const key = match?.[1];
      return key && keys.has(key) ? `${key}=""` : line;
    })
    .join('\n');
}

export function repairInvalidRuntimeEnvFile(
  envFilePath: string,
  { logger = defaultLogger }: { logger?: RuntimeConfigLogger } = {}
): RuntimeEnvFileRepairResult {
  const resolvedPath = path.resolve(envFilePath);
  if (!fs.existsSync(resolvedPath)) {
    return { repaired: false, env: {}, errors: [], invalidKeys: [] };
  }

  const recovery = recoverInvalidRuntimeEnv(readDotEnvFile(resolvedPath));
  if (recovery.invalidKeys.length === 0) {
    return { repaired: false, ...recovery };
  }

  const previousText = fs.readFileSync(resolvedPath, 'utf8');
  const nextText = clearInvalidEnvFileKeys(previousText, recovery.invalidKeys);
  fs.writeFileSync(resolvedPath, nextText, { encoding: 'utf8', mode: 0o600 });
  logger({
    level: 'warn',
    message: `Cleared invalid runtime settings from ${resolvedPath}: ${recovery.errors.join('; ')}`,
  });

  return { repaired: true, ...recovery };
}

export function watchRuntimeEnvFile({
  envFilePath = path.resolve(process.cwd(), '.env'),
  manager = getRuntimeConfigManager(),
  baseEnv = process.env,
  envFilePrecedence = 'base',
  debounceMs = 250,
  logger = defaultLogger,
  onReloadSuccess,
  envOverlay,
}: {
  envFilePath?: string;
  manager?: RuntimeConfigManager;
  baseEnv?: EnvLike;
  envFilePrecedence?: RuntimeEnvFilePrecedence;
  debounceMs?: number;
  logger?: RuntimeConfigLogger;
  onReloadSuccess?: (manager: RuntimeConfigManager) => void;
  envOverlay?: () => EnvLike;
} = {}) {
  let timer: NodeJS.Timeout | undefined;
  const resolvedEnvFilePath = path.resolve(envFilePath);
  const watchTarget = fs.existsSync(resolvedEnvFilePath)
    ? resolvedEnvFilePath
    : path.dirname(resolvedEnvFilePath);
  const watchedFileName = path.basename(resolvedEnvFilePath);

  const reload = () => {
    try {
      const result = manager.reload({
        ...loadRuntimeEnvFile(resolvedEnvFilePath, baseEnv, envFilePrecedence),
        ...(envOverlay?.() ?? {}),
      });
      if (result.ok) onReloadSuccess?.(manager);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger({ level: 'error', message: `Runtime env reload failed: ${message}` });
    }
  };

  const scheduleReload = (fileName?: string | Buffer | null) => {
    if (fileName && String(fileName) !== watchedFileName && watchTarget !== resolvedEnvFilePath) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(reload, debounceMs);
    timer.unref?.();
  };

  const watcher = fs.watch(watchTarget, (_eventType, fileName) => {
    scheduleReload(fileName);
  });

  return {
    close: () => {
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
