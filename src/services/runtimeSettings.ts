import type {
  RuntimeSettingsSnapshot,
  RuntimeSettingsUpdate,
} from '../lib/runtimeSettings';

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `配置请求失败（HTTP ${response.status}）`);
  }
  return data;
}

export async function loadRuntimeSettings(signal?: AbortSignal) {
  const response = await fetch('/api/runtime-settings', { signal });
  return readJsonResponse<RuntimeSettingsSnapshot>(response);
}

export async function saveRuntimeSettings(update: RuntimeSettingsUpdate) {
  const response = await fetch('/api/runtime-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  return readJsonResponse<RuntimeSettingsSnapshot>(response);
}
