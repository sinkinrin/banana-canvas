import type {
  RuntimeSettingsSnapshot,
  RuntimeSettingsUpdate,
} from '../lib/runtimeSettings';
import i18n, { getCurrentLanguage } from '../i18n';

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const fallback = response.status === 403
      ? i18n.t('settings.localOnly')
      : i18n.t('settings.requestFailed', { status: response.status });
    throw new Error(response.status < 500 && response.status !== 403 && data.error ? data.error : fallback);
  }
  return data;
}

export async function loadRuntimeSettings(signal?: AbortSignal) {
  const response = await fetch('/api/runtime-settings', {
    signal,
    headers: { 'Accept-Language': getCurrentLanguage() },
  });
  return readJsonResponse<RuntimeSettingsSnapshot>(response);
}

export async function saveRuntimeSettings(update: RuntimeSettingsUpdate) {
  const response = await fetch('/api/runtime-settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': getCurrentLanguage(),
    },
    body: JSON.stringify(update),
  });
  return readJsonResponse<RuntimeSettingsSnapshot>(response);
}
