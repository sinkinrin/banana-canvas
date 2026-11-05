export type GenerationInfo = {
  apiModel?: string;
  upstreamRequestId?: string;
  usage?: Record<string, unknown>;
  svgUsage?: Record<string, unknown>;
  reportedModel?: string;
  elapsedMs?: number;
  requestedQuality?: string;
  reportedQuality?: string;
  requestedSize?: string;
  reportedSize?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type ImagePreview = { imageUrl: string; index: number; partialImageIndex: number };
export type GenerationResult = { imageUrl: string; images?: string[]; generationInfo?: GenerationInfo };

export function normalizeGenerationInfo(value: unknown): GenerationInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const info: GenerationInfo = {};
  for (const key of ['upstreamRequestId', 'apiModel', 'reportedModel', 'requestedQuality', 'reportedQuality', 'requestedSize', 'reportedSize'] as const) {
    if (typeof source[key] === 'string' && source[key].trim()) info[key] = source[key].slice(0, 200);
  }
  for (const key of ['elapsedMs', 'inputTokens', 'outputTokens'] as const) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key]) && source[key] >= 0) info[key] = Math.round(source[key]);
  }
  for (const [key, sourceValue] of [['usage', source.usage], ['svgUsage', source.svgUsage]] as const) {
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) info[key] = sourceValue as Record<string, unknown>;
  }
  return Object.keys(info).length ? info : undefined;
}

export function readReportedImageInfo(value: unknown): GenerationInfo {
  const data = value && typeof value === 'object' ? value as Record<string, any> : {};
  return normalizeGenerationInfo({ reportedModel: data.model, reportedQuality: data.quality, reportedSize: data.size,
    inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, usage: data.usage, svgUsage: data.svg_usage }) ?? {};
}

export function asGenerationResult(value: string | GenerationResult): GenerationResult {
  return typeof value === 'string' ? { imageUrl: value } : value;
}
