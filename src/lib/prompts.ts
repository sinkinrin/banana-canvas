export type PromptTemplate = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type PromptTemplateDraft = Pick<PromptTemplate, 'title' | 'content' | 'tags'>;

export const MAX_PROMPT_TITLE_LENGTH = 120;
export const MAX_PROMPT_CONTENT_LENGTH = 20_000;
export const MAX_PROMPT_TAGS = 12;
export const MAX_PROMPT_TAG_LENGTH = 40;

export function normalizePromptTags(tags: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of tags) {
    const tag = value.trim().replace(/\s+/g, ' ');
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }
  return normalized.slice(0, MAX_PROMPT_TAGS);
}

export function parsePromptTags(value: string) {
  return normalizePromptTags(value.split(/[,，\n]/));
}

export function createPromptTitle(content: string) {
  const firstLine = content.trim().split(/\r?\n/, 1)[0]?.trim() || '未命名提示词';
  return firstLine.length > 36 ? `${firstLine.slice(0, 36)}…` : firstLine;
}

export function filterPromptTemplates(prompts: PromptTemplate[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return prompts;
  return prompts.filter((prompt) =>
    [prompt.title, prompt.content, ...prompt.tags]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
  );
}

export function sortPromptTemplates(prompts: PromptTemplate[]) {
  return [...prompts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
