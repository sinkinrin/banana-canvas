import { isOfficialImageModel, normalizeOfficialImageOptions, validateOfficialImageOptions, type OfficialImageOptions } from '../lib/officialImages';
import {
  getImageModelConfig,
  isBananaImageModel,
  isImage2Model,
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
  getImageInputLimits,
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
  markupImage?: unknown;
  officialImageOptions?: unknown;
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
  markupImage?: ReferenceImageInput;
  officialImageOptions?: OfficialImageOptions;
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

function validateImage(value: unknown, label: string, maxBytes = MAX_IMAGE_BYTES): ValidationResult<{
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
  if (byteLength > maxBytes) {
    return {
      ok: false,
      error: `${getImageDisplayLabel(label)}大小为 ${formatMebibytes(byteLength)}，超过单张 ${formatMebibytes(maxBytes)} 限制`,
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

function collectEffectiveReferences(body: GenerateImageRequestBody, model?: ImageModelId): ValidationResult<{
  images: ReferenceImageInput[];
  byteLength: number;
}> {
  const limits = getImageInputLimits(model);
  const rawReferences = body.referenceImages !== undefined
    ? body.referenceImages
    : body.referenceImage !== undefined
      ? [body.referenceImage]
      : [];

  if (!Array.isArray(rawReferences)) {
    return { ok: false, error: 'referenceImages must be an array' };
  }

  if (rawReferences.length > limits.count) {
    return { ok: false, error: `referenceImages must contain at most ${limits.count} images` };
  }

  const references: ReferenceImageInput[] = [];
  let byteLength = 0;
  for (const [index, rawReference] of rawReferences.entries()) {
    const result = validateImage(rawReference, `referenceImages[${index}]`, limits.single);
    if (!result.ok) return result;
    references.push(result.value.image);
    byteLength += result.value.byteLength;
  }

  if (byteLength > limits.total) {
    return {
      ok: false,
      error: `参考图合计大小为 ${formatMebibytes(byteLength)}，超过 ${formatMebibytes(limits.total)} 总限制`,
    };
  }

  return { ok: true, value: { images: references, byteLength } };
}

export function validateGenerateImageRequest(body: unknown): ValidationResult<ValidGenerateImageRequest> {
  const requestBody: GenerateImageRequestBody = isRecord(body) ? body : {};

  const imageModel = normalizeImageModel(requestBody.imageModel);
  const official = isOfficialImageModel(imageModel);
  const promptLimit = official ? 32000 : MAX_PROMPT_CHARACTERS;
  const limits = getImageInputLimits(imageModel);

  if (requestBody.prompt !== undefined && typeof requestBody.prompt !== 'string') {
    return { ok: false, error: 'prompt must be a string' };
  }
  if (typeof requestBody.prompt === 'string' && requestBody.prompt.length > promptLimit) {
    return { ok: false, error: `prompt must be at most ${promptLimit} characters` };
  }

  const modelConfig = getImageModelConfig(imageModel);
  const isBananaModel = isBananaImageModel(imageModel);
  const references = collectEffectiveReferences(requestBody, imageModel);
  if (!references.ok) return references;

  let maskImage: ReferenceImageInput | undefined;
  if (requestBody.maskImage !== undefined) {
    if (modelConfig.provider !== 'openai-chat' && !official) {
      return { ok: false, error: 'maskImage is only supported for Image2 requests' };
    }

    const maskResult = validateImage(requestBody.maskImage, 'maskImage', limits.single);
    if (!maskResult.ok) return maskResult;
    if (maskResult.value.image.mimeType !== 'image/png') {
      return { ok: false, error: 'maskImage must be an image/png payload' };
    }
    if (references.value.byteLength + maskResult.value.byteLength > limits.total) {
      return {
        ok: false,
        error: `参考图与蒙版合计大小超过 ${formatMebibytes(limits.total)} 总限制`,
      };
    }
    maskImage = maskResult.value.image;
  }

  let markupImage: ReferenceImageInput | undefined;
  if (requestBody.markupImage !== undefined) {
    if (!official) return { ok: false, error: 'Markup requires an official image provider' };
    const markup = validateImage(requestBody.markupImage, 'markupImage', limits.single);
    if (!markup.ok) return markup;
    if (markup.value.image.mimeType !== 'image/png') return { ok: false, error: 'Markup must be a transparent PNG' };
    markupImage = markup.value.image;
  }
  if (official) {
    if (!requestBody.prompt?.trim()) return { ok: false, error: 'prompt must not be empty' };
    const error = validateOfficialImageOptions(requestBody.officialImageOptions, imageModel, references.value.images.length, Boolean(maskImage), Boolean(markupImage));
    if (error) return { ok: false, error };
    if (references.value.images.some(image => image.mimeType === 'image/gif')) return { ok: false, error: 'Official edits require PNG, JPEG or WebP input' };
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
      ...(official ? { markupImage, officialImageOptions: normalizeOfficialImageOptions(requestBody.officialImageOptions) } : {}),
      bananaOptions: isBananaModel
        ? normalizeBananaOptionsForModel(imageModel, requestBody.bananaOptions)
        : {},
      image2Options: isImage2Model(imageModel)
        ? normalizeImage2Options(requestBody.image2Options, imageModel)
        : {},
    },
  };
}
