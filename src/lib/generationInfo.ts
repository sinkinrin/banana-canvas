export type GenerationInfo = {
  apiModel?: string;
  reportedModel?: string;
  elapsedMs?: number;
  requestedQuality?: string;
  reportedQuality?: string;
  requestedSize?: string;
  reportedSize?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type GenerationResult = { imageUrl: string; generationInfo?: GenerationInfo };

export function normalizeGenerationInfo(value: unknown): GenerationInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const info: GenerationInfo = {};
  for (const key of ['apiModel', 'reportedModel', 'requestedQuality', 'reportedQuality', 'requestedSize', 'reportedSize'] as const) {
    if (typeof source[key] === 'string' && source[key].trim()) info[key] = source[key].slice(0, 200);
  }
  for (const key of ['elapsedMs', 'inputTokens', 'outputTokens'] as const) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key]) && source[key] >= 0) info[key] = Math.round(source[key]);
  }
  return Object.keys(info).length ? info : undefined;
}

export function readReportedImageInfo(value: unknown): GenerationInfo {
  const data = value && typeof value === 'object' ? value as Record<string, any> : {};
  return normalizeGenerationInfo({ reportedModel: data.model, reportedQuality: data.quality, reportedSize: data.size,
    inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }) ?? {};
}

export function asGenerationResult(value: string | GenerationResult): GenerationResult {
  return typeof value === 'string' ? { imageUrl: value } : value;
}
