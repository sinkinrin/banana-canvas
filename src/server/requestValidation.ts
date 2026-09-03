import {
  getImageModelConfig,
  isBananaImageModel,
  normalizeBananaAspectRatio,
  normalizeBananaAspectRatioForModel,
  normalizeBananaImageSize,
  normalizeBananaImageSizeForModel,
  normalizeBananaOptionsForModel,
  normalizeImage2Options,
  normalizeImageModel,
  type BananaAspectRatio,
  type BananaImageSize,
  type BananaOptions,
  type Image2Options,
  type ImageModelId,
  type ReferenceImageInput,
} from '../lib/imageModels';
import {
  decodedBase64ByteLength,
  formatMebibytes,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_TOTAL_INPUT_IMAGE_BYTES,
} from '../lib/imageInputLimits';

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
export const MAX_IMAGE_BYTES = MAX_REFERENCE_IMAGE_BYTES;
export const MAX_TOTAL_IMAGE_BYTES = MAX_TOTAL_INPUT_IMAGE_BYTES;

function getImageDisplayLabel(label: string) {
  const referenceMatch = label.match(/^referenceImages\[(\d+)]$/);
  if (referenceMatch) return `第 ${Number(referenceMatch[1]) + 1} 张参考图`;
  if (label === 'maskImage') return '蒙版图片';
  return label;
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
  const byteLength = decodedBase64ByteLength(value.data);
  if (byteLength === null) {
    return { ok: false, error: `${label}.data must be non-empty base64` };
  }
  if (byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `${getImageDisplayLabel(label)}大小为 ${formatMebibytes(byteLength)}，超过单张 ${formatMebibytes(MAX_IMAGE_BYTES)} 限制`,
    };
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
    return {
      ok: false,
      error: `参考图合计大小为 ${formatMebibytes(byteLength)}，超过 ${formatMebibytes(MAX_TOTAL_IMAGE_BYTES)} 总限制`,
    };
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
  const isBananaModel = isBananaImageModel(imageModel);
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
      return {
        ok: false,
        error: `参考图与蒙版合计大小超过 ${formatMebibytes(MAX_TOTAL_IMAGE_BYTES)} 总限制`,
      };
    }
    maskImage = maskResult.value.image;
  }

  return {
    ok: true,
    value: {
      prompt: requestBody.prompt ?? '',
      imageModel,
      provider: modelConfig.provider,
      aspectRatio: isBananaModel
        ? normalizeBananaAspectRatioForModel(imageModel, requestBody.aspectRatio)
        : normalizeBananaAspectRatio(requestBody.aspectRatio),
      imageSize: isBananaModel
        ? normalizeBananaImageSizeForModel(imageModel, requestBody.imageSize)
        : normalizeBananaImageSize(requestBody.imageSize),
      referenceImages: references.value.images,
      maskImage,
      bananaOptions: isBananaModel
        ? normalizeBananaOptionsForModel(imageModel, requestBody.bananaOptions)
        : {},
      image2Options: imageModel === 'image2'
        ? normalizeImage2Options(requestBody.image2Options)
        : {},
    },
  };
}
