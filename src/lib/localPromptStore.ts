import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createPromptTitle,
  MAX_PROMPT_CONTENT_LENGTH,
  MAX_PROMPT_TAG_LENGTH,
  MAX_PROMPT_TAGS,
  MAX_PROMPT_TITLE_LENGTH,
  normalizePromptTags,
  sortPromptTemplates,
  type PromptTemplate,
  type PromptTemplateDraft,
} from './prompts';

const MAX_PROMPT_TEMPLATES = 1_000;

export type LocalPromptStore = {
  list: () => Promise<PromptTemplate[]>;
  create: (input: unknown) => Promise<PromptTemplate>;
  update: (promptId: string, input: unknown) => Promise<PromptTemplate | null>;
  delete: (promptId: string) => Promise<boolean>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePromptId(promptId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(promptId)) throw new Error('Invalid prompt id');
}

function parsePromptDraft(value: unknown, existing?: PromptTemplate): PromptTemplateDraft {
  if (!isRecord(value)) throw new Error('Invalid prompt payload');
  const rawContent = value.content === undefined ? existing?.content : value.content;
  const rawTitle = value.title === undefined ? existing?.title : value.title;
  const rawTags = value.tags === undefined ? existing?.tags ?? [] : value.tags;

  if (typeof rawContent !== 'string') throw new Error('Prompt content must be a string');
  const content = rawContent.trim();
  if (!content || content.length > MAX_PROMPT_CONTENT_LENGTH) {
    throw new Error(`Prompt content must contain 1 to ${MAX_PROMPT_CONTENT_LENGTH} characters`);
  }
  if (rawTitle !== undefined && typeof rawTitle !== 'string') {
    throw new Error('Prompt title must be a string');
  }
  const title = (rawTitle ?? '').trim() || createPromptTitle(content);
  if (title.length > MAX_PROMPT_TITLE_LENGTH) {
    throw new Error(`Prompt title must be at most ${MAX_PROMPT_TITLE_LENGTH} characters`);
  }
  if (!Array.isArray(rawTags) || rawTags.some((tag) => typeof tag !== 'string')) {
    throw new Error('Prompt tags must be an array of strings');
  }
  if (rawTags.length > MAX_PROMPT_TAGS || rawTags.some((tag) => tag.length > MAX_PROMPT_TAG_LENGTH)) {
    throw new Error('Prompt tags exceed the supported limits');
  }

  return { title, content, tags: normalizePromptTags(rawTags) };
}

function isPromptTemplate(value: unknown): value is PromptTemplate {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.content === 'string'
    && Array.isArray(value.tags)
    && value.tags.every((tag) => typeof tag === 'string')
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && value.title.length > 0
    && value.title.length <= MAX_PROMPT_TITLE_LENGTH
    && value.content.length > 0
    && value.content.length <= MAX_PROMPT_CONTENT_LENGTH
    && value.tags.length <= MAX_PROMPT_TAGS
    && value.tags.every((tag) => tag.length > 0 && tag.length <= MAX_PROMPT_TAG_LENGTH)
    && Number.isFinite(Date.parse(value.createdAt))
    && Number.isFinite(Date.parse(value.updatedAt));
}

export function createLocalPromptStore(dataDir: string): LocalPromptStore {
  const filePath = path.join(path.resolve(dataDir), 'prompt-library.json');
  let operationQueue = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const readPrompts = async () => {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as { version?: unknown; prompts?: unknown };
      if (parsed.version !== 1 || !Array.isArray(parsed.prompts) || !parsed.prompts.every(isPromptTemplate)) {
        throw new Error('Invalid prompt library file');
      }
      return sortPromptTemplates(parsed.prompts);
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  };

  const writePrompts = async (prompts: PromptTemplate[]) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify({ version: 1, prompts: sortPromptTemplates(prompts) }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 }
      );
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  };

  return {
    list: () => enqueue(async () => await readPrompts()),
    create: (input) => enqueue(async () => {
      const prompts = await readPrompts();
      if (prompts.length >= MAX_PROMPT_TEMPLATES) throw new Error('Prompt library limit reached');
      const draft = parsePromptDraft(input);
      const now = new Date().toISOString();
      const prompt: PromptTemplate = {
        id: randomUUID(),
        ...draft,
        createdAt: now,
        updatedAt: now,
      };
      await writePrompts([prompt, ...prompts]);
      return prompt;
    }),
    update: (promptId, input) => enqueue(async () => {
      validatePromptId(promptId);
      const prompts = await readPrompts();
      const existing = prompts.find((prompt) => prompt.id === promptId);
      if (!existing) return null;
      const updated: PromptTemplate = {
        ...existing,
        ...parsePromptDraft(input, existing),
        updatedAt: new Date().toISOString(),
      };
      await writePrompts(prompts.map((prompt) => prompt.id === promptId ? updated : prompt));
      return updated;
    }),
    delete: (promptId) => enqueue(async () => {
      validatePromptId(promptId);
      const prompts = await readPrompts();
      if (!prompts.some((prompt) => prompt.id === promptId)) return false;
      await writePrompts(prompts.filter((prompt) => prompt.id !== promptId));
      return true;
    }),
  };
}
