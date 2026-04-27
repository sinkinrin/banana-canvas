import { generateImage } from '../../services/gemini';
import type { GenerateImageParams } from '../../services/gemini';
import type { InlineImageData } from '../../lib/canvasState';
import type { Image2Options } from '../../lib/imageModels';
import type { MaskGeneratePayload } from '../mask/MaskEditorModal';

type MaskImage = MaskGeneratePayload['maskImage'];

function toReferencePayload(image: InlineImageData) {
  return { data: image.data, mimeType: image.mimeType };
}

export function buildPromptMaskGenerationPayload({
  maskPrompt,
  maskImage,
  sourceImage,
  sourceIndex,
  referenceImages,
  aspectRatio,
  imageSize,
  image2Options,
}: {
  maskPrompt: string;
  maskImage: MaskImage;
  sourceImage: InlineImageData;
  sourceIndex: number;
  referenceImages: InlineImageData[];
  aspectRatio: GenerateImageParams['aspectRatio'];
  imageSize: GenerateImageParams['imageSize'];
  image2Options: Image2Options | undefined;
}): GenerateImageParams {
  const editReferences = [
    sourceImage,
    ...referenceImages.filter((_, index) => index !== sourceIndex),
  ].slice(0, 4);

  return {
    prompt: maskPrompt,
    imageModel: 'image2' as const,
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: editReferences.map(toReferencePayload),
    maskImage,
  };
}

export function buildImageMaskGenerationPayload({
  maskPrompt,
  maskImage,
  sourceImage,
  aspectRatio,
  imageSize,
  image2Options,
}: {
  maskPrompt: string;
  maskImage: MaskImage;
  sourceImage: InlineImageData;
  aspectRatio: GenerateImageParams['aspectRatio'];
  imageSize: GenerateImageParams['imageSize'];
  image2Options: Image2Options | undefined;
}): GenerateImageParams {
  return {
    prompt: maskPrompt,
    imageModel: 'image2' as const,
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: [toReferencePayload(sourceImage)],
    maskImage,
  };
}

export function useMaskGeneration() {
  return {
    generateMaskImage: generateImage,
  };
}
