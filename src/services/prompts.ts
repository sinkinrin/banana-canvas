import type { PromptTemplate, PromptTemplateDraft } from '../lib/prompts';

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `提示词库请求失败（HTTP ${response.status}）`);
  return body;
}

export async function loadPromptTemplates(signal?: AbortSignal) {
  const body = await readJson<{ prompts: PromptTemplate[] }>(
    await fetch('/api/prompts', { signal })
  );
  return body.prompts;
}

export async function createPromptTemplate(draft: PromptTemplateDraft) {
  const body = await readJson<{ prompt: PromptTemplate }>(await fetch('/api/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  }));
  return body.prompt;
}

export async function updatePromptTemplate(promptId: string, draft: PromptTemplateDraft) {
  const body = await readJson<{ prompt: PromptTemplate }>(
    await fetch(`/api/prompts/${encodeURIComponent(promptId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
  );
  return body.prompt;
}

export async function deletePromptTemplate(promptId: string) {
  await readJson<{ ok: true }>(await fetch(`/api/prompts/${encodeURIComponent(promptId)}`, {
    method: 'DELETE',
  }));
}
