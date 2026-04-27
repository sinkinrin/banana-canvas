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
  customKey?: unknown;
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
  customKey?: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDecodableBase64(value: string) {
  if (!value.trim()) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;

  try {
    return Buffer.from(value, 'base64').length > 0;
  } catch {
    return false;
  }
}

function validateImage(value: unknown, label: string): ValidationResult<ReferenceImageInput> {
  if (!isRecord(value)) return { ok: false, error: `${label} must be an object` };
  if (typeof value.data !== 'string') return { ok: false, error: `${label}.data must be a string` };
  if (typeof value.mimeType !== 'string') return { ok: false, error: `${label}.mimeType must be a string` };
  if (!value.mimeType.startsWith('image/')) {
    return { ok: false, error: `${label}.mimeType must start with image/` };
  }
  if (!isDecodableBase64(value.data)) {
    return { ok: false, error: `${label}.data must be non-empty base64` };
  }

  return { ok: true, value: { data: value.data, mimeType: value.mimeType } };
}

function collectEffectiveReferences(body: GenerateImageRequestBody): ValidationResult<ReferenceImageInput[]> {
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
  for (const [index, rawReference] of rawReferences.entries()) {
    const result = validateImage(rawReference, `referenceImages[${index}]`);
    if (!result.ok) return result;
    references.push(result.value);
  }

  return { ok: true, value: references };
}

export function validateGenerateImageRequest(body: unknown): ValidationResult<ValidGenerateImageRequest> {
  const requestBody: GenerateImageRequestBody = isRecord(body) ? body : {};

  if (requestBody.prompt !== undefined && typeof requestBody.prompt !== 'string') {
    return { ok: false, error: 'prompt must be a string' };
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
    if (maskResult.value.mimeType !== 'image/png') {
      return { ok: false, error: 'maskImage must be an image/png payload' };
    }
    maskImage = maskResult.value;
  }

  return {
    ok: true,
    value: {
      prompt: requestBody.prompt ?? '',
      imageModel,
      provider: modelConfig.provider,
      aspectRatio: normalizeBananaAspectRatio(requestBody.aspectRatio),
      imageSize: normalizeBananaImageSize(requestBody.imageSize),
      referenceImages: references.value,
      maskImage,
      bananaOptions: normalizeBananaOptions(requestBody.bananaOptions),
      image2Options: normalizeImage2Options(requestBody.image2Options),
      customKey: typeof requestBody.customKey === 'string' ? requestBody.customKey : undefined,
    },
  };
}
