import { useEffect, useRef, useState } from 'react';
import {
  createReferenceImagePayload,
  imageAssetFromDataUrl,
  resolveReferenceImages,
  type CanvasImageAsset,
} from '../../lib/canvasState';
import { generateImage } from '../../services/gemini';
import type { AppNode } from '../../store';
import { normalizeImageModel } from '../../lib/imageModels';

export function canRerunImageNode(data: Partial<AppNode['data']>) {
  return Boolean(data.prompt) && data.generationMode !== 'mask-edit';
}

export function getRerunReferenceImages(
  data: Partial<AppNode['data']>,
  assets: Record<string, CanvasImageAsset>
) {
  const referenceImages = resolveReferenceImages(data as AppNode['data'], assets);
  return referenceImages.length > 0
    ? referenceImages.map((image) => ({ data: image.data, mimeType: image.mimeType }))
    : undefined;
}

export function buildDownloadFileName(now = Date.now()) {
  return `banana-art-${now}.png`;
}

export function buildReferenceNodeData({
  imageModel,
  bananaOptions,
  image2Options,
  referencePayload,
}: {
  imageModel: AppNode['data']['imageModel'];
  bananaOptions: AppNode['data']['bananaOptions'];
  image2Options: AppNode['data']['image2Options'];
  referencePayload: Partial<AppNode['data']>;
}): AppNode['data'] {
  const normalizedModel = normalizeImageModel(imageModel);

  return {
    prompt: '',
    imageModel: normalizedModel,
    bananaOptions: normalizedModel === 'banana' ? bananaOptions : undefined,
    image2Options: normalizedModel === 'image2' ? image2Options : undefined,
    ...referencePayload,
  };
}

export function useImageNodeActions() {
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const rerunAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      rerunAbortRef.current?.abort();
    };
  }, []);

  return {
    copiedImage,
    copiedPrompt,
    isRegenerating,
    setCopiedImage,
    setCopiedPrompt,
    setIsRegenerating,
    rerunAbortRef,
    generateImage,
    createReferenceImagePayload,
    imageAssetFromDataUrl,
  };
}
