import { isOfficialImageModel, type OfficialImageOptions } from '../../lib/officialImages';
import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { generateImageWithInfo as generateImage, type GenerateImageParams } from '../../services/gemini';
import type { InlineImageData } from '../../lib/canvasState';
import { getImage2MaskModel, type ImageModelId, type Image2Options } from '../../lib/imageModels';
import type { MaskGeneratePayload } from '../mask/MaskEditorModal';
import { registerGenerationTask } from '../../lib/generationTasks';

export function officialOptionsForEdit(value?: OfficialImageOptions): OfficialImageOptions | undefined {
  if (!value) return value;
  const options = { ...value };
  delete options.mask; delete options.markup;
  if (options.outputFormat === 'svg' || options.outputFormat === 'gif') {
    options.outputFormat = 'png'; delete options.svgModel; delete options.svgReasoning;
    delete options.frameCount; delete options.frameDurationMs;
  }
  return options;
}

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
  officialImageOptions,
  editMode,
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
  officialImageOptions?: OfficialImageOptions;
  editMode?: 'mask' | 'markup';
}): GenerateImageParams {
  const editReferences = [
    sourceImage,
    ...referenceImages.filter((_, index) => index !== sourceIndex),
  ].slice(0, isOfficialImageModel(imageModel) ? 16 : 4);

  return {
    prompt: maskPrompt,
    imageModel: getImage2MaskModel(imageModel),
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: editReferences.map(toReferencePayload),
    ...(isOfficialImageModel(imageModel) && editMode === 'markup' ? { markupImage: maskImage } : { maskImage }),
    ...(isOfficialImageModel(imageModel) ? { officialImageOptions: officialOptionsForEdit(officialImageOptions) } : {}),
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
  officialImageOptions,
  editMode,
}: {
  imageModel?: ImageModelId;
  maskPrompt: string;
  maskImage: MaskImage;
  sourceImage: InlineImageData;
  aspectRatio: GenerateImageParams['aspectRatio'];
  imageSize: GenerateImageParams['imageSize'];
  image2Options: Image2Options | undefined;
  officialImageOptions?: OfficialImageOptions;
  editMode?: 'mask' | 'markup';
}): GenerateImageParams {
  return {
    prompt: maskPrompt,
    imageModel: getImage2MaskModel(imageModel),
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: [toReferencePayload(sourceImage)],
    ...(isOfficialImageModel(imageModel) && editMode === 'markup' ? { markupImage: maskImage } : { maskImage }),
    ...(isOfficialImageModel(imageModel) ? { officialImageOptions: officialOptionsForEdit(officialImageOptions) } : {}),
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
      const unregister = registerGenerationTask(resultNodeId, controller);
      const unsubscribe = useStore.subscribe((state) => {
        if (state.projectSessionId !== projectSessionId ||
          !state.nodes.some((node) => node.id === sourceNodeId) ||
          !state.nodes.some((node) => node.id === resultNodeId)) controller.abort();
      });
      try {
        const result = await generate({ ...input, signal: controller.signal,
          onPreview: preview => { if (!controller.signal.aborted) useStore.getState().updateNodeData(resultNodeId, { previewImageUrl: preview.imageUrl }); } });
        controller.signal.throwIfAborted();
        const state = useStore.getState();
        const node = state.nodes.find(item => item.id === resultNodeId);
        if (node) for (const [index, imageUrl] of (result.images ?? []).slice(1).entries()) {
          state.addNode('imageNode', { x: node.position.x + (index + 1) * 580, y: node.position.y }, { ...node.data, imageUrl, generationInfo: result.generationInfo, isLoading: false, previewImageUrl: undefined });
        }
        return result;
      } finally {
        useStore.getState().updateNodeData(resultNodeId, { previewImageUrl: undefined });
        unregister();
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
