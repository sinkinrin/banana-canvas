import { useRef, useState } from 'react';
import { resolveReferenceImages, type InlineImageData } from '../../lib/canvasState';
import type { AppNode } from '../../store';

export type ReferenceImagePatch = Pick<AppNode['data'], 'referenceImage' | 'referenceImages' | 'referenceImageIds'>;

export type ReadImageFile = (file: File) => Promise<InlineImageData>;
export type OnReferenceImageReadError = (message: string) => void;

export function parseImageDataUrl(dataUrl: string): InlineImageData {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image format');
  return { mimeType: match[1], data: match[2], url: dataUrl };
}

export function createBrowserImageFileReader({
  createFileReader = () => new FileReader(),
}: {
  createFileReader?: () => FileReader;
} = {}): ReadImageFile {
  return (file) => new Promise((resolve, reject) => {
    const reader = createFileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      try {
        resolve(parseImageDataUrl(base64String));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export const readImageFile = createBrowserImageFileReader();

export function canAddReferenceImage({
  hasPendingReferenceHydration,
  referenceCount,
}: {
  hasPendingReferenceHydration: boolean;
  referenceCount: number;
}) {
  return !hasPendingReferenceHydration && referenceCount < 4;
}

export function selectImageFiles(
  files: Iterable<File>,
  { currentCount, maxCount = 4 }: { currentCount: number; maxCount?: number }
) {
  const remainingSlots = Math.max(0, maxCount - currentCount);
  return Array.from(files)
    .filter((file) => file.type.startsWith('image/'))
    .slice(0, remainingSlots);
}

export function extractPasteImageFiles(clipboardData: {
  items?: Iterable<{ kind: string; type: string; getAsFile: () => File | null }>;
}) {
  return Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function buildAddReferenceImagePatch({
  usesReferenceImageIds,
  referenceImageIds,
  referenceImages,
  nextImage,
}: {
  usesReferenceImageIds: boolean;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  nextImage: InlineImageData;
}): ReferenceImagePatch {
  if (usesReferenceImageIds) {
    return {
      referenceImageIds,
      referenceImages: [nextImage],
      referenceImage: undefined,
    };
  }

  return {
    referenceImages: [...referenceImages, nextImage].slice(0, 4),
    referenceImageIds: undefined,
    referenceImage: undefined,
  };
}

export function buildRemoveReferenceImagePatch({
  usesReferenceImageIds,
  referenceImageIds,
  referenceImages,
  index,
}: {
  usesReferenceImageIds: boolean;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  index: number;
}): ReferenceImagePatch {
  if (usesReferenceImageIds) {
    return {
      referenceImageIds: referenceImageIds.filter((_, currentIndex) => currentIndex !== index),
      referenceImages: undefined,
      referenceImage: undefined,
    };
  }

  return {
    referenceImages: referenceImages.filter((_, currentIndex) => currentIndex !== index),
    referenceImageIds: undefined,
    referenceImage: undefined,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '读取图片失败';
}

function alertReadError(message: string) {
  if (typeof globalThis.alert === 'function') {
    globalThis.alert(message);
  }
}

export function createReferenceImageController({
  nodeId,
  data,
  assets,
  assetsHydrated,
  updateNodeData,
  readImageFile,
  onReadError = alertReadError,
}: {
  nodeId: string;
  data: AppNode['data'];
  assets: Parameters<typeof resolveReferenceImages>[1];
  assetsHydrated: boolean;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  readImageFile: ReadImageFile;
  onReadError?: OnReferenceImageReadError;
}) {
  const referenceImages = resolveReferenceImages(data, assets);
  const rawReferenceImageIds = data.referenceImageIds ?? [];
  const referenceImageIds = assetsHydrated
    ? rawReferenceImageIds.filter((referenceImageId) => assets[referenceImageId])
    : rawReferenceImageIds;
  const usesReferenceImageIds = data.referenceImageIds != null;
  const hasPendingReferenceHydration = !assetsHydrated && rawReferenceImageIds.length > 0;

  const appendReferenceImage = (nextImage: InlineImageData) => {
    if (!canAddReferenceImage({ hasPendingReferenceHydration, referenceCount: referenceImages.length })) return;
    updateNodeData(nodeId, buildAddReferenceImagePatch({
      usesReferenceImageIds,
      referenceImageIds,
      referenceImages,
      nextImage,
    }));
  };

  const removeReferenceImage = (index: number) => {
    if (hasPendingReferenceHydration) return;
    updateNodeData(nodeId, buildRemoveReferenceImagePatch({
      usesReferenceImageIds,
      referenceImageIds,
      referenceImages,
      index,
    }));
  };

  const readAndAppendFiles = async (files: File[]) => {
    if (hasPendingReferenceHydration) return;

    const existingInlineReferenceImages = usesReferenceImageIds
      ? [...(data.referenceImages ?? [])]
      : [...referenceImages];
    const selectedFiles = selectImageFiles(files, {
      currentCount: usesReferenceImageIds
        ? referenceImageIds.length + existingInlineReferenceImages.length
        : existingInlineReferenceImages.length,
    });
    let nextReferenceImages = existingInlineReferenceImages;

    for (const file of selectedFiles) {
      try {
        const nextImage = await readImageFile(file);
        const availableSlots = usesReferenceImageIds
          ? Math.max(0, 4 - referenceImageIds.length)
          : 4;
        nextReferenceImages = [...nextReferenceImages, nextImage].slice(0, availableSlots);

        updateNodeData(nodeId, {
          referenceImageIds: usesReferenceImageIds ? referenceImageIds : undefined,
          referenceImages: nextReferenceImages,
          referenceImage: undefined,
        });
      } catch (error) {
        onReadError(getErrorMessage(error));
      }
    }
  };

  const handleImageUpload = async (event: { target: { files: FileList | File[] | null; value: string } }) => {
    await readAndAppendFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handlePaste = async (event: { clipboardData: Parameters<typeof extractPasteImageFiles>[0]; preventDefault: () => void }) => {
    const files = extractPasteImageFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    await readAndAppendFiles(files);
  };

  return {
    referenceImages,
    referenceImageIds,
    usesReferenceImageIds,
    hasPendingReferenceHydration,
    appendReferenceImage,
    removeReferenceImage,
    handleImageUpload,
    handlePaste,
  };
}

export function useReferenceImages({
  nodeId,
  data,
  assets,
  assetsHydrated,
  updateNodeData,
  readImageFile = createBrowserImageFileReader(),
  onReadError = alertReadError,
}: {
  nodeId: string;
  data: AppNode['data'];
  assets: Parameters<typeof resolveReferenceImages>[1];
  assetsHydrated: boolean;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  readImageFile?: ReadImageFile;
  onReadError?: OnReferenceImageReadError;
}) {
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = createReferenceImageController({
    nodeId,
    data,
    assets,
    assetsHydrated,
    updateNodeData,
    readImageFile,
    onReadError,
  });

  const withReadingState = async (action: () => Promise<void>) => {
    setIsReadingFile(true);
    try {
      await action();
    } finally {
      setIsReadingFile(false);
    }
  };

  return {
    fileInputRef,
    isReadingFile,
    setIsReadingFile,
    ...controller,
    handleImageUpload: (event: Parameters<typeof controller.handleImageUpload>[0]) =>
      withReadingState(() => controller.handleImageUpload(event)),
    handlePaste: (event: Parameters<typeof controller.handlePaste>[0]) =>
      withReadingState(() => controller.handlePaste(event)),
  };
}
