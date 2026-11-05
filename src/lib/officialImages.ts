// OpenAI Images API contract. Keep this independent from CPA compatibility options.
// Sources: developers.openai.com/api/docs/guides/image-generation and
// developers.openai.com/api/reference/resources/images/methods/{generate,edit}
export const OFFICIAL_IMAGE_MODELS = {
  'openai-image2': 'gpt-image-2',
  'openai-image2.5-flare': 'gpt-image-2.5-flare',
  'openai-image2.5-sunburst': 'gpt-image-2.5-sunburst',
  'openai-image2.6-flare': 'gpt-image-2.6-flare',
  'openai-image2.6-sunburst': 'gpt-image-2.6-sunburst',
} as const;
export type OfficialImageModelId = keyof typeof OFFICIAL_IMAGE_MODELS;
export const OFFICIAL_QUALITY_VALUES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const OFFICIAL_OUTPUT_FORMATS = ['png', 'jpeg', 'webp', 'svg', 'gif'] as const;
export const SVG_REASONING_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type OfficialImageReference = { image_url: string; file_id?: never } | { file_id: string; image_url?: never };
export type OfficialImageOptions = {
  size?: string;
  quality?: typeof OFFICIAL_QUALITY_VALUES[number];
  complexity?: 'low' | 'medium' | 'high';
  background?: 'auto' | 'opaque' | 'transparent';
  outputFormat?: typeof OFFICIAL_OUTPUT_FORMATS[number];
  outputCompression?: number;
  moderation?: 'auto' | 'low';
  stream?: boolean;
  partialImages?: number;
  n?: number;
  frameCount?: number;
  frameDurationMs?: number;
  svgModel?: string;
  svgReasoning?: typeof SVG_REASONING_VALUES[number];
  safetyIdentifier?: string;
  imageInputs?: OfficialImageReference[];
  mask?: OfficialImageReference;
  markup?: OfficialImageReference;
};

export function isOfficialImageModel(value: unknown): value is OfficialImageModelId {
  return typeof value === 'string' && Object.hasOwn(OFFICIAL_IMAGE_MODELS, value);
}
export function getOfficialImageCapabilities(model: OfficialImageModelId) {
  const is26 = model.includes('2.6');
  return { qualities: model === 'openai-image2' ? OFFICIAL_QUALITY_VALUES.slice(0, 4) : OFFICIAL_QUALITY_VALUES,
    formats: is26 ? OFFICIAL_OUTPUT_FORMATS : OFFICIAL_OUTPUT_FORMATS.slice(0, 3),
    complexity: is26, markup: model !== 'openai-image2', maxReferences: 16, maxPromptCharacters: 32000 };
}
export const OFFICIAL_IMAGE_MIME = {
  png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif',
} as const;
export const OFFICIAL_MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const OFFICIAL_MAX_TOTAL_IMAGE_BYTES = 16 * OFFICIAL_MAX_IMAGE_BYTES;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isOfficialImageReference(value: unknown): value is OfficialImageReference {
  if (!record(value)) return false;
  if (typeof value.file_id === 'string' && value.file_id.trim() && value.image_url === undefined) return true;
  if (typeof value.image_url !== 'string' || value.file_id !== undefined || value.image_url.length > 20971520) return false;
  return /^https:\/\//i.test(value.image_url) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value.image_url);
}
export function normalizeOfficialImageOptions(value: unknown): OfficialImageOptions {
  if (!record(value)) return {};
  const result: Record<string, unknown> = {};
  const enums: Record<string, readonly string[]> = {
    quality: OFFICIAL_QUALITY_VALUES, complexity: ['low', 'medium', 'high'], background: ['auto', 'opaque', 'transparent'],
    outputFormat: OFFICIAL_OUTPUT_FORMATS, moderation: ['auto', 'low'], svgReasoning: SVG_REASONING_VALUES,
  };
  for (const [key, allowed] of Object.entries(enums)) if (typeof value[key] === 'string' && allowed.includes(value[key] as string)) result[key] = value[key];
  for (const key of ['size', 'svgModel', 'safetyIdentifier']) if (typeof value[key] === 'string' && value[key].trim()) result[key] = value[key].trim();
  for (const key of ['outputCompression', 'partialImages', 'n', 'frameCount', 'frameDurationMs']) if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = value[key];
  if (typeof value.stream === 'boolean') result.stream = value.stream;
  if (Array.isArray(value.imageInputs)) result.imageInputs = value.imageInputs.filter(isOfficialImageReference);
  for (const key of ['mask', 'markup']) if (isOfficialImageReference(value[key])) result[key] = value[key];
  return result as OfficialImageOptions;
}

export function validateOfficialImageOptions(value: unknown, model: OfficialImageModelId, referenceCount: number, hasMask: boolean, hasMarkup: boolean): string | undefined {
  if (value !== undefined && !record(value)) return 'officialImageOptions must be an object';
  const raw = (value ?? {}) as Record<string, unknown>;
  const options = normalizeOfficialImageOptions(value);
  const capabilities = getOfficialImageCapabilities(model);
  for (const key of Object.keys(raw)) {
    if (!(key in options)) return `Unsupported or invalid official image option: ${key}`;
  }
  const bounds: Record<string, [number, number]> = { outputCompression: [0, 100], partialImages: [0, 3], n: [1, 10], frameCount: [2, 64], frameDurationMs: [20, 655350] };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const number = raw[key];
    if (number !== undefined && (!Number.isInteger(number) || (number as number) < min || (number as number) > max)) return `${key} must be an integer between ${min} and ${max}`;
  }
  if (options.quality && !capabilities.qualities.includes(options.quality)) return 'Quality is not supported by this model';
  if (options.outputFormat && !capabilities.formats.includes(options.outputFormat)) return 'Output format is not supported by this model';
  if (options.complexity && !capabilities.complexity) return 'Complexity requires GPT Image 2.6';
  if (options.size && options.size !== 'auto') {
    const match = options.size.match(/^(\d+)x(\d+)$/);
    if (!match) return 'size must be auto or WIDTHxHEIGHT';
    const width = Number(match[1]); const height = Number(match[2]);
    if (!width || !height || width % 16 || height % 16 || width > 3840 || height > 3840 || width / height < 1 / 3 || width / height > 3) return 'Dimensions must be multiples of 16, at most 3840 per edge, with an aspect ratio from 1:3 to 3:1';
    // GIF has a separate, account/model-dependent frame pixel budget.
    if (options.outputFormat !== 'gif' && (width * height < 655360 || width * height > 8294400)) return 'Image pixel count must be between 655360 and 8294400';
  }
  const inputs = options.imageInputs ?? [];
  if (raw.imageInputs !== undefined && (!Array.isArray(raw.imageInputs) || inputs.length !== raw.imageInputs.length)) return 'Each input must contain exactly one HTTPS/data image_url or file_id';
  const total = referenceCount + inputs.length;
  if (total > 16) return 'Official image edits support at most 16 input images';
  const mask = hasMask || Boolean(options.mask); const markup = hasMarkup || Boolean(options.markup);
  if ((mask || markup) && !total) return 'Mask and markup edits require a source image';
  if ((hasMask && options.mask) || (hasMarkup && options.markup)) return 'Provide an edit layer only once';
  if (mask && markup) return 'markup and mask cannot be combined';
  if (markup && !capabilities.markup) return 'Markup requires GPT Image 2.5 or 2.6';
  const format = options.outputFormat ?? 'png';
  if (options.background === 'transparent' && !['png', 'webp'].includes(format)) return 'Transparent backgrounds require PNG or WebP output';
  if (options.outputCompression !== undefined && !['jpeg', 'webp'].includes(format)) return 'Compression only applies to JPEG and WebP';
  if (['svg', 'gif'].includes(format)) {
    if (total || mask || markup) return 'SVG and GIF output are only supported for generation, not edits';
    if (options.stream === true || options.partialImages !== undefined) return 'SVG and GIF do not support streaming or partial images';
  }
  if (format === 'svg' && (options.n ?? 1) !== 1) return 'SVG generation requires n=1';
  if (format !== 'gif' && (options.frameCount !== undefined || options.frameDurationMs !== undefined)) return 'Animation settings require GIF output';
  if (format !== 'svg' && (options.svgModel || options.svgReasoning)) return 'SVG author settings require SVG output';
  if (options.svgReasoning && !options.svgModel) return 'SVG reasoning requires an SVG author model';
  if (options.safetyIdentifier && options.safetyIdentifier.length > 128) return 'safetyIdentifier must be at most 128 characters';
  if (options.svgModel && options.svgModel.length > 256) return 'SVG model name is too long';
  if (options.partialImages !== undefined && options.stream === false) return 'Partial images require streaming';
  return undefined;
}

export function resolveOfficialImageSize(aspectRatio = '1:1', imageSize = '1K') {
  const [a, b] = aspectRatio.split(':').map(Number);
  const edge = imageSize === '4K' ? 3840 : imageSize === '2K' ? 2048 : 1024;
  const scale = edge / Math.max(a || 1, b || 1);
  let width = Math.round((a || 1) * scale / 16) * 16;
  let height = Math.round((b || 1) * scale / 16) * 16;
  const pixels = width * height;
  if (pixels < 655360 || pixels > 8294400) {
    const adjustment = Math.sqrt((pixels < 655360 ? 655360 : 8294400) / pixels);
    const round = pixels < 655360 ? Math.ceil : Math.floor;
    width = round(width * adjustment / 16) * 16; height = round(height * adjustment / 16) * 16;
  }
  return `${width}x${height}`;
}

export function officialImageRequestFields(model: OfficialImageModelId, prompt: string, options: OfficialImageOptions, fallbackSize: string) {
  const body: Record<string, unknown> = { model: OFFICIAL_IMAGE_MODELS[model], prompt, size: options.size ?? fallbackSize };
  const fields = { quality: 'quality', complexity: 'complexity', background: 'background', outputFormat: 'output_format',
    outputCompression: 'output_compression', moderation: 'moderation', n: 'n', stream: 'stream', partialImages: 'partial_images',
    frameCount: 'frame_count', frameDurationMs: 'frame_duration_ms', safetyIdentifier: 'safety_identifier' } as const;
  for (const [key, field] of Object.entries(fields)) {
    const value = options[key as keyof typeof fields];
    if (value !== undefined) body[field] = value;
  }
  if (options.svgModel) body.svg = { model: options.svgModel, ...(options.svgReasoning ? { reasoning: { effort: options.svgReasoning } } : {}) };
  // response_format, style and input_fidelity are intentionally absent: unsupported for these models.
  return body;
}
