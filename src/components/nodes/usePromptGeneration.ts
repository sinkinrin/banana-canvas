import { useRef, useState } from 'react';
import { generateImage } from '../../services/gemini';
import type { GenerateImageParams } from '../../services/gemini';
import type { AppNode } from '../../store';
import type { InlineImageData } from '../../lib/canvasState';
import type { BananaOptions, Image2Options, ImageModelId } from '../../lib/imageModels';

type GeneratedEdge = { id: string; source: string; target: string };

export function buildGenerationReferenceData({
  referenceImageIds,
  referenceImages,
}: {
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
}) {
  return referenceImageIds.length > 0
    ? { referenceImageIds }
    : referenceImages.length > 0
      ? { referenceImages }
      : {};
}

export function buildImagePlaceholderData({
  prompt,
  imageModel,
  imageModelLabel,
  aspectRatio,
  imageSize,
  bananaOptions,
  image2Options,
  createdAt,
  referenceData,
}: {
  prompt: string;
  imageModel: ImageModelId;
  imageModelLabel: string;
  aspectRatio: GenerateImageParams['aspectRatio'];
  imageSize: GenerateImageParams['imageSize'];
  bananaOptions: BananaOptions | undefined;
  image2Options: Image2Options | undefined;
  createdAt: string;
  referenceData: Partial<AppNode['data']>;
}): AppNode['data'] {
  return {
    prompt,
    imageModel,
    aspectRatio,
    imageSize,
    bananaOptions: imageModel === 'banana' ? bananaOptions : undefined,
    image2Options: imageModel === 'image2' ? image2Options : undefined,
    isLoading: true,
    error: undefined,
    createdAt,
    generationTitle: `${imageModelLabel} | ${prompt.slice(0, 28) || '生成任务'}`,
    ...referenceData,
  };
}

export function buildPromptGenerationEdges(sourceId: string, targetIds: string[]): GeneratedEdge[] {
  return targetIds.map((nodeId) => ({
    id: `e-${sourceId}-${nodeId}`,
    source: sourceId,
    target: nodeId,
  }));
}

export type PromptGenerationRunInput = {
  nodeId: string;
  prompt: string;
  imageModel: ImageModelId;
  imageModelLabel: string;
  aspectRatio: GenerateImageParams['aspectRatio'];
  imageSize: GenerateImageParams['imageSize'];
  bananaOptions?: BananaOptions;
  image2Options?: Image2Options;
  batchCount: number;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  hasPendingReferenceHydration: boolean;
  nodePosition?: { x: number; y: number };
};

export type PromptGenerationRunnerDeps = {
  generateImage: (input: GenerateImageParams) => Promise<string>;
  addNode: (type: 'imageNode', position: { x: number; y: number }, data: AppNode['data']) => string;
  deleteNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  setEdges: (edges: GeneratedEdge[]) => void;
  commitPrompt: (prompt: string) => void;
  now: () => string;
  createAbortController?: () => AbortController;
  removeApiKey?: (key: string) => void;
  getApiKey?: (key: string) => string | null;
  alertInvalidApiKey?: () => void;
  reloadWindow?: () => void;
  openSelectKey?: () => unknown | Promise<unknown>;
  onGeneratedCountChange?: (count: number) => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '生成失败';
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function isInvalidBananaKeyError(message: string) {
  return (
    message.includes('Requested entity was not found') ||
    message.includes('PERMISSION_DENIED') ||
    message.includes('The caller does not have permission') ||
    message.includes('API key not valid') ||
    message.includes('API key is required')
  );
}

function toReferencePayload(referenceImages: InlineImageData[]) {
  return referenceImages.length > 0
    ? referenceImages.map((image) => ({ data: image.data, mimeType: image.mimeType }))
    : undefined;
}

async function handleInvalidBananaKey(deps: PromptGenerationRunnerDeps) {
  const keyName = 'custom_gemini_api_key';
  const hasCustomKey = deps.getApiKey?.(keyName);

  if (hasCustomKey) {
    deps.removeApiKey?.(keyName);
    deps.alertInvalidApiKey?.();
    deps.reloadWindow?.();
    return;
  }

  if (deps.removeApiKey && !deps.getApiKey) {
    deps.removeApiKey(keyName);
  }
  await deps.openSelectKey?.();
}

export function createPromptGenerationRunner(deps: PromptGenerationRunnerDeps) {
  let isGenerating = false;
  let abortController: AbortController | null = null;

  return {
    get abortController() {
      return abortController;
    },
    async run(input: PromptGenerationRunInput) {
      const prompt = input.prompt.trim();
      if (!prompt || isGenerating) return;

      if (input.hasPendingReferenceHydration) {
        deps.updateNodeData(input.nodeId, { error: '参考图仍在加载中，请稍候' });
        return;
      }

      isGenerating = true;
      abortController = deps.createAbortController?.() ?? new AbortController();
      const controller = abortController;
      const createdNodeIds: string[] = [];
      let generatedCount = 0;

      try {
        deps.commitPrompt(prompt);
        deps.onGeneratedCountChange?.(0);
        deps.updateNodeData(input.nodeId, { isLoading: true, error: undefined });

        const referenceData = buildGenerationReferenceData({
          referenceImageIds: input.referenceImageIds,
          referenceImages: input.referenceImages,
        });
        const baseX = input.nodePosition ? input.nodePosition.x + 400 : 0;
        const baseY = input.nodePosition ? input.nodePosition.y : 0;
        const batchCount = Math.max(1, Math.floor(input.batchCount || 1));
        const createdAt = deps.now();

        for (let index = 0; index < batchCount; index += 1) {
          const nodeId = deps.addNode(
            'imageNode',
            { x: baseX, y: baseY + index * 430 },
            buildImagePlaceholderData({
              prompt,
              imageModel: input.imageModel,
              imageModelLabel: input.imageModelLabel,
              aspectRatio: input.aspectRatio,
              imageSize: input.imageSize,
              bananaOptions: input.bananaOptions,
              image2Options: input.image2Options,
              createdAt,
              referenceData,
            })
          );
          createdNodeIds.push(nodeId);
        }

        deps.setEdges(buildPromptGenerationEdges(input.nodeId, createdNodeIds));

        const results = await Promise.allSettled(
          createdNodeIds.map(async (nodeId) => {
            try {
              const imageUrl = await deps.generateImage({
                prompt,
                imageModel: input.imageModel,
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
                bananaOptions: input.imageModel === 'banana' ? input.bananaOptions : undefined,
                image2Options: input.imageModel === 'image2' ? input.image2Options : undefined,
                referenceImages: toReferencePayload(input.referenceImages),
                signal: controller.signal,
              });

              if (controller.signal.aborted) {
                deps.deleteNode(nodeId);
                throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
              }

              deps.updateNodeData(nodeId, {
                imageUrl,
                prompt,
                imageModel: input.imageModel,
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
                bananaOptions: input.imageModel === 'banana' ? input.bananaOptions : undefined,
                image2Options: input.imageModel === 'image2' ? input.image2Options : undefined,
                isLoading: false,
                error: undefined,
              });
              generatedCount += 1;
              deps.onGeneratedCountChange?.(generatedCount);
              return imageUrl;
            } catch (error) {
              if (isAbortError(error)) {
                deps.deleteNode(nodeId);
                throw error;
              }

              const errorMessage = getErrorMessage(error);
              deps.updateNodeData(nodeId, {
                isLoading: false,
                error: errorMessage,
              });
              throw error;
            }
          })
        );

        const failures = results.filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected' && !isAbortError(result.reason)
        );

        if (failures.length > 0) {
          const errorMessage = getErrorMessage(failures[0].reason);
          deps.updateNodeData(input.nodeId, { error: errorMessage });

          if (input.imageModel === 'banana' && isInvalidBananaKeyError(errorMessage)) {
            await handleInvalidBananaKey(deps);
          }
        }
      } finally {
        deps.updateNodeData(input.nodeId, { isLoading: false });
        abortController = null;
        isGenerating = false;
      }
    },
    abort() {
      abortController?.abort();
    },
  };
}

export function usePromptGeneration({
  nodeId,
  nodePosition,
  updateNodeData,
  addNode,
  deleteNode,
  setEdges,
  commitPrompt,
}: {
  nodeId: string;
  nodePosition?: { x: number; y: number };
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  addNode: (type: 'imageNode', position: { x: number; y: number }, data: AppNode['data']) => string;
  deleteNode: (nodeId: string) => void;
  setEdges: (edges: GeneratedEdge[]) => void;
  commitPrompt: (prompt: string) => void;
}) {
  const [generatedCount, setGeneratedCount] = useState(0);
  const depsRef = useRef({
    nodeId,
    nodePosition,
    updateNodeData,
    addNode,
    deleteNode,
    setEdges,
    commitPrompt,
  });
  depsRef.current = {
    nodeId,
    nodePosition,
    updateNodeData,
    addNode,
    deleteNode,
    setEdges,
    commitPrompt,
  };

  const runnerRef = useRef<ReturnType<typeof createPromptGenerationRunner> | null>(null);
  if (!runnerRef.current) {
    runnerRef.current = createPromptGenerationRunner({
      generateImage,
      updateNodeData: (targetNodeId, patch) => depsRef.current.updateNodeData(targetNodeId, patch),
      addNode: (type, position, data) => depsRef.current.addNode(type, position, data),
      deleteNode: (targetNodeId) => depsRef.current.deleteNode(targetNodeId),
      setEdges: (edges) => depsRef.current.setEdges(edges),
      commitPrompt: (prompt) => depsRef.current.commitPrompt(prompt),
      now: () => new Date().toISOString(),
      getApiKey: (key) => globalThis.localStorage?.getItem(key) ?? null,
      removeApiKey: (key) => globalThis.localStorage?.removeItem(key),
      alertInvalidApiKey: () => globalThis.alert?.('您填写的 API Key 无效或没有权限，请重新输入。'),
      reloadWindow: () => globalThis.window?.location.reload(),
      openSelectKey: () => globalThis.window?.aistudio?.openSelectKey?.(),
      onGeneratedCountChange: setGeneratedCount,
    });
  }

  return {
    generatedCount,
    runGeneration: (input: Omit<PromptGenerationRunInput, 'nodeId' | 'nodePosition'>) =>
      runnerRef.current!.run({
        ...input,
        nodeId: depsRef.current.nodeId,
        nodePosition: depsRef.current.nodePosition,
      }),
    abortGeneration: () => runnerRef.current?.abort(),
  };
}
