import { useEffect, useRef, useState } from 'react';
import { resolveReferenceImages, type InlineImageData } from '../../lib/canvasState';
import { useStore, type AppNode } from '../../store';
import i18n from '../../i18n';
import { base64ToBytes, inspectReferenceImage } from '../../lib/referenceImageFormat';
import {
  decodedBase64ByteLength,
  formatMebibytes,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_TOTAL_INPUT_IMAGE_BYTES,
} from '../../lib/imageInputLimits';

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
        if (!/^data:image\/(?:png|jpeg|webp|gif|avif|heic|heif);base64,/.test(base64String)) {
          const encoded = base64String.split(';base64,')[1];
          if (!encoded) throw new Error('Invalid image format');
          const format = inspectReferenceImage(base64ToBytes(encoded));
          resolve(parseImageDataUrl(`data:${format.mimeType};base64,${encoded}`));
        } else {
          resolve(parseImageDataUrl(base64String));
        }
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error(i18n.t('promptNode.errors.readImage')));
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
    .filter((file) => file.type.startsWith('image/') || /\.(?:png|jpe?g|webp|gif|mpo|heic|heif|avif)$/i.test(file.name))
    .slice(0, remainingSlots);
}

export function getReferenceImageFileSizeError(file: Pick<File, 'name' | 'size'>) {
  if (!Number.isFinite(file.size) || file.size <= MAX_REFERENCE_IMAGE_BYTES) return null;
  return i18n.t('promptNode.errors.referenceFileTooLarge', {
    name: file.name,
    size: formatMebibytes(file.size),
    limit: formatMebibytes(MAX_REFERENCE_IMAGE_BYTES),
  });
}

export function getReferenceImageTotalSizeError(
  file: Pick<File, 'name' | 'size'>,
  currentBytes: number
) {
  if (
    !Number.isFinite(file.size) ||
    currentBytes + file.size <= MAX_TOTAL_INPUT_IMAGE_BYTES
  ) {
    return null;
  }
  return i18n.t('promptNode.errors.referenceTotalTooLarge', {
    name: file.name,
    size: formatMebibytes(currentBytes + file.size),
    limit: formatMebibytes(MAX_TOTAL_INPUT_IMAGE_BYTES),
  });
}

function getReferenceImagesByteLength(images: InlineImageData[]) {
  return images.reduce(
    (total, image) => total + (decodedBase64ByteLength(image.data) ?? 0),
    0
  );
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
  return error instanceof Error ? error.message : i18n.t('promptNode.errors.readImage');
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
  getCurrent,
}: {
  nodeId: string;
  data: AppNode['data'];
  assets: Parameters<typeof resolveReferenceImages>[1];
  assetsHydrated: boolean;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  readImageFile: ReadImageFile;
  onReadError?: OnReferenceImageReadError;
  getCurrent?: () => { data: AppNode['data']; assets: typeof assets; assetsHydrated: boolean } | null;
}) {
  const referenceImages = resolveReferenceImages(data, assets);
  const rawReferenceImageIds = data.referenceImageIds ?? [];
  const referenceImageIds = assetsHydrated
    ? rawReferenceImageIds.filter((referenceImageId) => assets[referenceImageId])
    : rawReferenceImageIds;
  const usesReferenceImageIds = data.referenceImageIds !== null && data.referenceImageIds !== undefined;
  const hasPendingReferenceHydration = !assetsHydrated && rawReferenceImageIds.length > 0;

  let fallbackData = data;
  const currentReferences = () => {
    const current = getCurrent ? getCurrent() : { data: fallbackData, assets, assetsHydrated };
    if (!current || !current.assetsHydrated) return null;
    const ids = current.data.referenceImageIds?.filter((id) => current.assets[id]);
    const images = resolveReferenceImages(current.data, current.assets);
    const inline = ids ? current.data.referenceImages ?? [] : images;
    return { ids, inline, images: ids ? [...images, ...inline] : images };
  };
  const commit = (patch: ReferenceImagePatch) => {
    fallbackData = { ...fallbackData, ...patch };
    updateNodeData(nodeId, patch);
  };
  const appendReferenceImage = (nextImage: InlineImageData, name = '') => {
    const current = currentReferences();
    if (!current || current.images.length >= 4) return;
    const sizeError = getReferenceImageTotalSizeError(
      { name, size: decodedBase64ByteLength(nextImage.data) ?? 0 }, getReferenceImagesByteLength(current.images)
    );
    if (sizeError) { onReadError(sizeError); return; }
    commit({
      referenceImageIds: current.ids,
      referenceImages: [...current.inline, nextImage],
      referenceImage: undefined,
    });
  };

  const removeReferenceImage = (index: number) => {
    const current = currentReferences();
    if (!current) return;
    commit(buildRemoveReferenceImagePatch({
      usesReferenceImageIds: current.ids !== undefined,
      referenceImageIds: current.ids ?? [], referenceImages: current.images, index,
    }));
  };

  const readAndAppendFiles = async (files: File[]) => {
    const current = currentReferences();
    if (!current) return;
    const selectedFiles = selectImageFiles(files, { currentCount: current.images.length });
    for (const file of selectedFiles) {
      const latest = currentReferences();
      if (!latest || latest.images.length >= 4) return;
      const sizeError = getReferenceImageFileSizeError(file)
        ?? getReferenceImageTotalSizeError(file, getReferenceImagesByteLength(latest.images));
      if (sizeError) { onReadError(sizeError); continue; }
      try {
        const nextImage = await readImageFile(file);
        // Commit against live state: other pastes or removals may have completed
        // while FileReader was running, or the project may have been closed.
        appendReferenceImage(nextImage, file.name);
      } catch (error) {
        if (currentReferences()) onReadError(getErrorMessage(error));
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
  const [pendingReads, setPendingReads] = useState(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const projectSessionId = useStore.getState().projectSessionId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = createReferenceImageController({
    nodeId,
    data,
    assets,
    assetsHydrated,
    updateNodeData,
    readImageFile,
    onReadError,
    getCurrent: () => {
      const state = useStore.getState();
      const node = state.nodes.find((item) => item.id === nodeId);
      return active.current && state.projectSessionId === projectSessionId && node
        ? { data: node.data, assets: state.assets, assetsHydrated: state.assetsHydrated }
        : null;
    },
  });

  const withReadingState = async (action: () => Promise<void>) => {
    setPendingReads((count) => count + 1);
    try {
      await action();
    } finally {
      setPendingReads((count) => count - 1);
    }
  };

  return {
    fileInputRef,
    isReadingFile: pendingReads > 0,
    ...controller,
    handleImageUpload: (event: Parameters<typeof controller.handleImageUpload>[0]) =>
      withReadingState(() => controller.handleImageUpload(event)),
    handlePaste: (event: Parameters<typeof controller.handlePaste>[0]) =>
      withReadingState(() => controller.handlePaste(event)),
  };
}
