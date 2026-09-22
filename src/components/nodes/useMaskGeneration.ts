import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { generateImageWithInfo as generateImage, type GenerateImageParams } from '../../services/gemini';
import type { InlineImageData } from '../../lib/canvasState';
import { getImage2MaskModel, type ImageModelId, type Image2Options } from '../../lib/imageModels';
import type { MaskGeneratePayload } from '../mask/MaskEditorModal';

type MaskImage = MaskGeneratePayload['maskImage'];

function toReferencePayload(image: InlineImageData) {
  return { data: image.data, mimeType: image.mimeType };
}

export function buildPromptMaskGenerationPayload({
  imageModel,
  maskPrompt,
  maskImage,
  sourceImage,
  sourceIndex,
  referenceImages,
  aspectRatio,
  imageSize,
  image2Options,
}: {
  imageModel?: ImageModelId;
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
    imageModel: getImage2MaskModel(imageModel),
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: editReferences.map(toReferencePayload),
    maskImage,
  };
}

export function buildImageMaskGenerationPayload({
  imageModel,
  maskPrompt,
  maskImage,
  sourceImage,
  aspectRatio,
  imageSize,
  image2Options,
}: {
  imageModel?: ImageModelId;
  maskPrompt: string;
  maskImage: MaskImage;
  sourceImage: InlineImageData;
  aspectRatio: GenerateImageParams['aspectRatio'];
  imageSize: GenerateImageParams['imageSize'];
  image2Options: Image2Options | undefined;
}): GenerateImageParams {
  return {
    prompt: maskPrompt,
    imageModel: getImage2MaskModel(imageModel),
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: [toReferencePayload(sourceImage)],
    maskImage,
  };
}

export function createMaskGenerationRunner(sourceNodeId: string, generate = generateImage) {
  const controllers = new Set<AbortController>();
  return {
    abort() { for (const controller of controllers) controller.abort(); },
    async run(input: GenerateImageParams, resultNodeId: string) {
      const controller = new AbortController();
      const projectSessionId = useStore.getState().projectSessionId;
      controllers.add(controller);
      const unsubscribe = useStore.subscribe((state) => {
        if (state.projectSessionId !== projectSessionId ||
          !state.nodes.some((node) => node.id === sourceNodeId) ||
          !state.nodes.some((node) => node.id === resultNodeId)) controller.abort();
      });
      try {
        const result = await generate({ ...input, signal: controller.signal });
        controller.signal.throwIfAborted();
        return result;
      } finally {
        unsubscribe();
        controllers.delete(controller);
      }
    },
  };
}

export function useMaskGeneration(sourceNodeId: string) {
  const runner = useRef<ReturnType<typeof createMaskGenerationRunner> | null>(null);
  runner.current ??= createMaskGenerationRunner(sourceNodeId);
  useEffect(() => () => runner.current?.abort(), []);
  return { generateMaskImage: runner.current.run };
}
