import fs from 'node:fs';
import path from 'node:path';

import type express from 'express';

import type {
  RuntimeSettingsSnapshot,
  RuntimeSettingsUpdate,
} from '../lib/runtimeSettings';
import type { EnvLike } from './proxy';
import {
  loadRuntimeEnvFile,
  type RuntimeConfigManager,
  type RuntimeEnvFilePrecedence,
} from './runtimeConfig';

const SETTINGS_ENV_KEYS = [
  'GEMINI_API_KEY',
  'IMAGE2_BASE_URL',
  'IMAGE2_API_KEY',
  'IMAGE2_MODEL',
  'IMAGE2_ENDPOINT_TYPE',
  'IMAGE2_HTTPS_PROXY',
  'IMAGE2_PROXY_MODE',
  'IMAGE2_STREAM',
  'IMAGE2_PARTIAL_IMAGES',
  'IMAGE2_MAX_ATTEMPTS',
  'IMAGE2_REQUEST_TIMEOUT_MS',
] as const;

type SettingsEnvKey = (typeof SETTINGS_ENV_KEYS)[number];
type SettingsEnvUpdates = Partial<Record<SettingsEnvKey, string>>;
const SENSITIVE_SETTINGS_ENV_KEYS = ['GEMINI_API_KEY', 'IMAGE2_API_KEY'] as const;
type SensitiveSettingsEnvKey = (typeof SENSITIVE_SETTINGS_ENV_KEYS)[number];

export type RuntimeSettingsSecretValues = Partial<Record<SensitiveSettingsEnvKey, string>>;

export type RuntimeSettingsSecretStore = {
  get: () => RuntimeSettingsSecretValues;
  replace: (values: RuntimeSettingsSecretValues) => void;
};

export class RuntimeSettingsValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('; '));
    this.name = 'RuntimeSettingsValidationError';
  }
}

export type RuntimeSettingsStore = {
  get: () => RuntimeSettingsSnapshot;
  update: (input: unknown) => RuntimeSettingsSnapshot;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringField(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  maxLength: number
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    errors.push(`${key} must be a string`);
    return undefined;
  }
  if (value.length > maxLength) {
    errors.push(`${key} must be at most ${maxLength} characters`);
    return undefined;
  }
  return value.trim();
}

function parseBooleanField(record: Record<string, unknown>, key: string, errors: string[]) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    errors.push(`${key} must be a boolean`);
    return undefined;
  }
  return value;
}

function parseIntegerField(
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  errors: string[]
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    errors.push(`${key} must be an integer between ${min} and ${max}`);
    return undefined;
  }
  return value as number;
}

function parseEnumField<T extends readonly string[]>(
  record: Record<string, unknown>,
  key: string,
  allowed: T,
  errors: string[]
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push(`${key} must be one of ${allowed.join(', ')}`);
    return undefined;
  }
  return value as T[number];
}

function validateHttpUrlField(value: string | undefined, key: string, errors: string[]) {
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

export function parseRuntimeSettingsUpdate(input: unknown): SettingsEnvUpdates {
  if (!isRecord(input)) {
    throw new RuntimeSettingsValidationError(['settings body must be an object']);
  }

  const errors: string[] = [];
  const updates: SettingsEnvUpdates = {};
  const image2 = input.image2 === undefined
    ? undefined
    : isRecord(input.image2)
      ? input.image2
      : (errors.push('image2 must be an object'), undefined);
  const gemini = input.gemini === undefined
    ? undefined
    : isRecord(input.gemini)
      ? input.gemini
      : (errors.push('gemini must be an object'), undefined);

  if (image2) {
    const baseUrl = parseStringField(image2, 'baseUrl', errors, 2_048);
    const apiKey = parseStringField(image2, 'apiKey', errors, 8_192);
    const clearApiKey = parseBooleanField(image2, 'clearApiKey', errors);
    const model = parseStringField(image2, 'model', errors, 256);
    const endpointType = parseEnumField(
      image2,
      'endpointType',
      ['auto', 'chat', 'images'] as const,
      errors
    );
    const proxyUrl = parseStringField(image2, 'proxyUrl', errors, 2_048);
    const proxyMode = parseEnumField(
      image2,
      'proxyMode',
      ['direct', 'auto', 'proxy'] as const,
      errors
    );
    const stream = parseBooleanField(image2, 'stream', errors);
    const partialImages = parseIntegerField(image2, 'partialImages', 0, 3, errors);
    const maxAttempts = parseIntegerField(image2, 'maxAttempts', 1, 8, errors);
    const requestTimeoutMs = parseIntegerField(
      image2,
      'requestTimeoutMs',
      1_000,
      900_000,
      errors
    );

    validateHttpUrlField(baseUrl, 'image2.baseUrl', errors);
    validateHttpUrlField(proxyUrl, 'image2.proxyUrl', errors);

    if (baseUrl !== undefined) updates.IMAGE2_BASE_URL = baseUrl;
    if (clearApiKey) updates.IMAGE2_API_KEY = '';
    else if (apiKey) updates.IMAGE2_API_KEY = apiKey;
    if (model !== undefined) updates.IMAGE2_MODEL = model;
    if (endpointType !== undefined) {
      updates.IMAGE2_ENDPOINT_TYPE = endpointType === 'auto' ? '' : endpointType;
    }
    if (proxyUrl !== undefined) updates.IMAGE2_HTTPS_PROXY = proxyUrl;
    if (proxyMode !== undefined) updates.IMAGE2_PROXY_MODE = proxyMode;
    if (stream !== undefined) updates.IMAGE2_STREAM = stream ? 'true' : 'false';
    if (partialImages !== undefined) updates.IMAGE2_PARTIAL_IMAGES = String(partialImages);
    if (maxAttempts !== undefined) updates.IMAGE2_MAX_ATTEMPTS = String(maxAttempts);
    if (requestTimeoutMs !== undefined) {
      updates.IMAGE2_REQUEST_TIMEOUT_MS = String(requestTimeoutMs);
    }
  }

  if (gemini) {
    const apiKey = parseStringField(gemini, 'apiKey', errors, 8_192);
    const clearApiKey = parseBooleanField(gemini, 'clearApiKey', errors);
    if (clearApiKey) updates.GEMINI_API_KEY = '';
    else if (apiKey) updates.GEMINI_API_KEY = apiKey;
  }

  if (errors.length > 0) throw new RuntimeSettingsValidationError(errors);
  return updates;
}

function formatEnvValue(value: string) {
  return JSON.stringify(value);
}

export function updateDotEnvText(text: string, updates: SettingsEnvUpdates) {
  const lines = text ? text.replace(/\r\n/g, '\n').split('\n') : [];
  const handled = new Set<SettingsEnvKey>();
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1] as SettingsEnvKey | undefined;
    if (!key || !(key in updates)) {
      nextLines.push(line);
      continue;
    }

    if (handled.has(key)) continue;
    nextLines.push(`${key}=${formatEnvValue(updates[key] ?? '')}`);
    handled.add(key);
  }

  const missingKeys = SETTINGS_ENV_KEYS.filter((key) => key in updates && !handled.has(key));
  if (missingKeys.length > 0 && nextLines.some((line) => line.trim())) {
    while (nextLines.at(-1) === '') nextLines.pop();
    nextLines.push('', '# Saved automatically by Banana Canvas settings.');
  }
  for (const key of missingKeys) {
    nextLines.push(`${key}=${formatEnvValue(updates[key] ?? '')}`);
  }

  return `${nextLines.join('\n').replace(/\n+$/, '')}\n`;
}

export function removeDotEnvKeys(text: string, keysToRemove: readonly string[]) {
  const keys = new Set(keysToRemove);
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return !match?.[1] || !keys.has(match[1]);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function toSnapshot(manager: RuntimeConfigManager): RuntimeSettingsSnapshot {
  const config = manager.get();
  const endpointType = config.env.IMAGE2_ENDPOINT_TYPE;

  return {
    autoLoad: true,
    image2: {
      baseUrl: config.image2.baseUrl,
      apiKeyConfigured: Boolean(config.image2.apiKey),
      model: config.image2.model,
      endpointType: endpointType === 'chat' || endpointType === 'images' ? endpointType : 'auto',
      proxyUrl: config.image2.proxyUrl,
      proxyMode: config.image2.proxyMode,
      stream: config.image2.stream,
      partialImages: config.image2.partialImages,
      maxAttempts: config.image2.maxAttempts,
      requestTimeoutMs: config.image2.requestTimeoutMs,
      ready: config.image2.missingKeys.length === 0,
      missingKeys: [...config.image2.missingKeys],
    },
    gemini: {
      apiKeyConfigured: Boolean(config.geminiApiKey),
    },
  };
}

export function createRuntimeSettingsStore({
  envFilePath,
  baseEnv,
  envFilePrecedence = 'base',
  manager,
  onReloadSuccess,
  secretStore,
}: {
  envFilePath: string;
  baseEnv: EnvLike;
  envFilePrecedence?: RuntimeEnvFilePrecedence;
  manager: RuntimeConfigManager;
  onReloadSuccess?: (manager: RuntimeConfigManager) => void;
  secretStore?: RuntimeSettingsSecretStore;
}): RuntimeSettingsStore {
  const resolvedEnvFilePath = path.resolve(envFilePath);
  const loadEffectiveEnv = () => ({
    ...loadRuntimeEnvFile(resolvedEnvFilePath, baseEnv, envFilePrecedence),
    ...(secretStore?.get() ?? {}),
  });

  return {
    get: () => toSnapshot(manager),
    update: (input) => {
      const updates = parseRuntimeSettingsUpdate(input as RuntimeSettingsUpdate);
      const previousExists = fs.existsSync(resolvedEnvFilePath);
      const previousText = previousExists ? fs.readFileSync(resolvedEnvFilePath, 'utf8') : '';
      const previousSecrets = secretStore?.get() ?? {};
      const nextSecrets = { ...previousSecrets };
      const fileUpdates = { ...updates };

      if (secretStore) {
        for (const key of SENSITIVE_SETTINGS_ENV_KEYS) {
          if (key in updates) nextSecrets[key] = updates[key] ?? '';
          delete fileUpdates[key];
        }
      }

      const envTextWithoutSecrets = secretStore
        ? removeDotEnvKeys(previousText, SENSITIVE_SETTINGS_ENV_KEYS)
        : previousText;
      const nextText = updateDotEnvText(envTextWithoutSecrets, fileUpdates);

      try {
        fs.mkdirSync(path.dirname(resolvedEnvFilePath), { recursive: true });
        fs.writeFileSync(resolvedEnvFilePath, nextText, { encoding: 'utf8', mode: 0o600 });
        secretStore?.replace(nextSecrets);
      } catch (error) {
        if (previousExists) {
          fs.writeFileSync(resolvedEnvFilePath, previousText, { encoding: 'utf8', mode: 0o600 });
        } else {
          fs.rmSync(resolvedEnvFilePath, { force: true });
        }
        secretStore?.replace(previousSecrets);
        throw error;
      }

      const result = manager.reload(loadEffectiveEnv());
      if (!result.ok) {
        if (previousExists) {
          fs.writeFileSync(resolvedEnvFilePath, previousText, { encoding: 'utf8', mode: 0o600 });
        } else {
          fs.rmSync(resolvedEnvFilePath, { force: true });
        }
        secretStore?.replace(previousSecrets);
        manager.reload(loadEffectiveEnv());
        throw new RuntimeSettingsValidationError(result.errors);
      }

      onReloadSuccess?.(manager);
      return toSnapshot(manager);
    },
  };
}

function isLoopbackAddress(address: string | undefined) {
  if (!address) return false;
  const normalized = address.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

export function mountRuntimeSettingsRoutes(
  app: express.Express,
  store: RuntimeSettingsStore
) {
  app.use('/api/runtime-settings', (req, res, next) => {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(403).json({ error: '运行时配置仅允许在本机修改' });
      return;
    }
    next();
  });

  app.get('/api/runtime-settings', (_req, res) => {
    res.json(store.get());
  });

  app.put('/api/runtime-settings', (req, res) => {
    try {
      res.json(store.update(req.body));
    } catch (error) {
      if (error instanceof RuntimeSettingsValidationError) {
        res.status(400).json({ error: error.message, errors: error.errors });
        return;
      }
      console.error('[runtime-settings] update failed:', error);
      res.status(500).json({ error: '保存运行时配置失败' });
    }
  });
}
