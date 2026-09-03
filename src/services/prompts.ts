import type { PromptTemplate, PromptTemplateDraft } from '../lib/prompts';
import i18n, { getCurrentLanguage } from '../i18n';

function headers(json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    'Accept-Language': getCurrentLanguage(),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const fallback = response.status === 404
      ? i18n.t('promptLibrary.errors.notFound')
      : i18n.t('promptLibrary.errors.request', { status: response.status });
    throw new Error(response.status < 500 && response.status !== 404 && body.error ? body.error : fallback);
  }
  return body;
}

export async function loadPromptTemplates(signal?: AbortSignal) {
  const body = await readJson<{ prompts: PromptTemplate[] }>(
    await fetch('/api/prompts', { signal, headers: headers() })
  );
  return body.prompts;
}

export async function createPromptTemplate(draft: PromptTemplateDraft) {
  const body = await readJson<{ prompt: PromptTemplate }>(await fetch('/api/prompts', {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(draft),
  }));
  return body.prompt;
}

export async function updatePromptTemplate(promptId: string, draft: PromptTemplateDraft) {
  const body = await readJson<{ prompt: PromptTemplate }>(
    await fetch(`/api/prompts/${encodeURIComponent(promptId)}`, {
      method: 'PATCH',
      headers: headers(true),
      body: JSON.stringify(draft),
    })
  );
  return body.prompt;
}

export async function deletePromptTemplate(promptId: string) {
  await readJson<{ ok: true }>(await fetch(`/api/prompts/${encodeURIComponent(promptId)}`, {
    method: 'DELETE',
    headers: headers(),
  }));
}
