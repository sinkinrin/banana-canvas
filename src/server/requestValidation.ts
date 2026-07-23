import {
  getImageModelConfig,
  normalizeBananaAspectRatio,
  normalizeBananaImageSize,
  normalizeBananaOptions,
  normalizeImage2Options,
  normalizeImageModel,
  type BananaAspectRatio,
  type BananaImageSize,
  type BananaOptions,
  type Image2Options,
  type ImageModelId,
  type ReferenceImageInput,
} from '../lib/imageModels';

export type GenerateImageRequestBody = {
  prompt?: unknown;
  imageModel?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  referenceImages?: unknown;
  referenceImage?: unknown;
  maskImage?: unknown;
  bananaOptions?: unknown;
  image2Options?: unknown;
};

export type ValidGenerateImageRequest = {
  prompt: string;
  imageModel: ImageModelId;
  provider: ReturnType<typeof getImageModelConfig>['provider'];
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  referenceImages: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
  bananaOptions: BananaOptions;
  image2Options: Image2Options;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
export const MAX_PROMPT_CHARACTERS = 20_000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;

function decodedBase64Length(value: string) {
  if (!value.trim()) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  if (value.length % 4 === 1) return false;
  if (Math.floor(value.length * 3 / 4) > MAX_IMAGE_BYTES + 2) return false;

  try {
    const length = Buffer.from(value, 'base64').length;
    return length > 0 ? length : false;
  } catch {
    return false;
  }
}

function validateImage(value: unknown, label: string): ValidationResult<{
  image: ReferenceImageInput;
  byteLength: number;
}> {
  if (!isRecord(value)) return { ok: false, error: `${label} must be an object` };
  if (typeof value.data !== 'string') return { ok: false, error: `${label}.data must be a string` };
  if (typeof value.mimeType !== 'string') return { ok: false, error: `${label}.mimeType must be a string` };
  if (!ALLOWED_IMAGE_MIME_TYPES.has(value.mimeType.toLowerCase())) {
    return { ok: false, error: `${label}.mimeType must be png, jpeg, webp, or gif` };
  }
  const byteLength = decodedBase64Length(value.data);
  if (byteLength === false) {
    return { ok: false, error: `${label}.data must be non-empty base64` };
  }
  if (byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: `${label} must be at most ${MAX_IMAGE_BYTES} decoded bytes` };
  }

  return {
    ok: true,
    value: {
      image: { data: value.data, mimeType: value.mimeType.toLowerCase() },
      byteLength,
    },
  };
}

function collectEffectiveReferences(body: GenerateImageRequestBody): ValidationResult<{
  images: ReferenceImageInput[];
  byteLength: number;
}> {
  const rawReferences = body.referenceImages !== undefined
    ? body.referenceImages
    : body.referenceImage !== undefined
      ? [body.referenceImage]
      : [];

  if (!Array.isArray(rawReferences)) {
    return { ok: false, error: 'referenceImages must be an array' };
  }

  if (rawReferences.length > 4) {
    return { ok: false, error: 'referenceImages must contain at most 4 images' };
  }

  const references: ReferenceImageInput[] = [];
  let byteLength = 0;
  for (const [index, rawReference] of rawReferences.entries()) {
    const result = validateImage(rawReference, `referenceImages[${index}]`);
    if (!result.ok) return result;
    references.push(result.value.image);
    byteLength += result.value.byteLength;
  }

  if (byteLength > MAX_TOTAL_IMAGE_BYTES) {
    return { ok: false, error: `referenceImages must total at most ${MAX_TOTAL_IMAGE_BYTES} decoded bytes` };
  }

  return { ok: true, value: { images: references, byteLength } };
}

export function validateGenerateImageRequest(body: unknown): ValidationResult<ValidGenerateImageRequest> {
  const requestBody: GenerateImageRequestBody = isRecord(body) ? body : {};

  if (requestBody.prompt !== undefined && typeof requestBody.prompt !== 'string') {
    return { ok: false, error: 'prompt must be a string' };
  }
  if (typeof requestBody.prompt === 'string' && requestBody.prompt.length > MAX_PROMPT_CHARACTERS) {
    return { ok: false, error: `prompt must be at most ${MAX_PROMPT_CHARACTERS} characters` };
  }

  const imageModel = normalizeImageModel(requestBody.imageModel);
  const modelConfig = getImageModelConfig(imageModel);
  const references = collectEffectiveReferences(requestBody);
  if (!references.ok) return references;

  let maskImage: ReferenceImageInput | undefined;
  if (requestBody.maskImage !== undefined) {
    if (modelConfig.provider !== 'openai-chat') {
      return { ok: false, error: 'maskImage is only supported for Image2 requests' };
    }

    const maskResult = validateImage(requestBody.maskImage, 'maskImage');
    if (!maskResult.ok) return maskResult;
    if (maskResult.value.image.mimeType !== 'image/png') {
      return { ok: false, error: 'maskImage must be an image/png payload' };
    }
    if (references.value.byteLength + maskResult.value.byteLength > MAX_TOTAL_IMAGE_BYTES) {
      return { ok: false, error: `images must total at most ${MAX_TOTAL_IMAGE_BYTES} decoded bytes` };
    }
    maskImage = maskResult.value.image;
  }

  return {
    ok: true,
    value: {
      prompt: requestBody.prompt ?? '',
      imageModel,
      provider: modelConfig.provider,
      aspectRatio: normalizeBananaAspectRatio(requestBody.aspectRatio),
      imageSize: normalizeBananaImageSize(requestBody.imageSize),
      referenceImages: references.value.images,
      maskImage,
      bananaOptions: normalizeBananaOptions(requestBody.bananaOptions),
      image2Options: normalizeImage2Options(requestBody.image2Options),
    },
  };
}
