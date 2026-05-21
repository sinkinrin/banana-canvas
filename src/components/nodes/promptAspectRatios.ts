import {
  BANANA_ASPECT_RATIO_VALUES,
  normalizeBananaAspectRatio,
  normalizeImageModel,
  type BananaAspectRatio,
  type ImageModelId,
} from '../../lib/imageModels';

export const IMAGE2_ASPECT_RATIO_VALUES = ['1:1', '4:3', '16:9', '3:4', '9:16'] as const;

export function getPromptAspectRatioOptions(imageModel: ImageModelId): BananaAspectRatio[] {
  return normalizeImageModel(imageModel) === 'image2'
    ? [...IMAGE2_ASPECT_RATIO_VALUES]
    : [...BANANA_ASPECT_RATIO_VALUES];
}

export function getEffectivePromptAspectRatio(
  imageModel: ImageModelId,
  value: unknown
): BananaAspectRatio {
  const normalizedRatio = normalizeBananaAspectRatio(value) ?? '1:1';
  const options = getPromptAspectRatioOptions(imageModel);
  return options.includes(normalizedRatio) ? normalizedRatio : '1:1';
}

export function getImage2MaskEditAspectRatio(value: unknown): BananaAspectRatio {
  return getEffectivePromptAspectRatio('image2', value);
}
