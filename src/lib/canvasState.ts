import type { Edge, Node } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

export type InlineImageData = {
  data: string;
  mimeType: string;
  url: string;
};

export type CanvasImageAsset = {
  id: string;
  data: string;
  mimeType: string;
};

export type CanvasNodeData = {
  prompt?: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "1:4" | "1:8" | "4:1" | "8:1";
  imageSize?: "512px" | "1K" | "2K" | "4K";
  batchCount?: number;
  referenceImageIds?: string[] | null;
  imageAssetId?: string;
  referenceImages?: InlineImageData[] | null;
  referenceImage?: InlineImageData | null;
  imageUrl?: string;
  isLoading?: boolean;
  error?: string;
  color?: string;
};

export type CanvasNode = Node<CanvasNodeData>;

export type HistoryCanvasState = {
  nodes: CanvasNode[];
  edges: Edge[];
};

export type PersistedCanvasState = HistoryCanvasState & {
  assets: Record<string, CanvasImageAsset>;
};

type HistoryStateLike = {
  nodes: CanvasNode[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }

  return false;
}

function isDataUrl(url: string) {
  return /^data:(image\/[^;]+);base64,(.+)$/.test(url);
}

export function imageAssetFromDataUrl(url: string): CanvasImageAsset | null {
  const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    id: uuidv4(),
    mimeType: match[1],
    data: match[2],
  };
}

export function createImageAsset(image: InlineImageData): CanvasImageAsset {
  return {
    id: uuidv4(),
    data: image.data,
    mimeType: image.mimeType,
  };
}

function assetUrl(asset: CanvasImageAsset) {
  return `data:${asset.mimeType};base64,${asset.data}`;
}

export function resolveReferenceImages(
  data: CanvasNodeData,
  assets: Record<string, CanvasImageAsset>
): InlineImageData[] {
  if (data.referenceImageIds?.length) {
    return data.referenceImageIds
      .map((id) => assets[id])
      .filter((asset): asset is CanvasImageAsset => Boolean(asset))
      .map((asset) => ({ data: asset.data, mimeType: asset.mimeType, url: assetUrl(asset) }));
  }

  if (data.referenceImages?.length) {
    return data.referenceImages;
  }

  return data.referenceImage ? [data.referenceImage] : [];
}

export function resolveImageUrl(
  data: CanvasNodeData,
  assets: Record<string, CanvasImageAsset>
): string | undefined {
  if (data.imageAssetId && assets[data.imageAssetId]) {
    return assetUrl(assets[data.imageAssetId]);
  }

  return data.imageUrl;
}

export function createReferenceImagePayload(
  imageUrl: string,
  imageAssetId?: string
): Pick<CanvasNodeData, 'referenceImageIds' | 'referenceImages'> | null {
  if (imageAssetId) {
    return {
      referenceImageIds: [imageAssetId],
      referenceImages: undefined,
    };
  }

  const inlineImage = imageAssetFromDataUrl(imageUrl);
  if (!inlineImage) {
    return null;
  }

  return {
    referenceImageIds: undefined,
    referenceImages: [{ data: inlineImage.data, mimeType: inlineImage.mimeType, url: imageUrl }],
  };
}

function sanitizeNodeDataForSnapshot(data: CanvasNodeData): CanvasNodeData {
  return {
    prompt: data.prompt,
    aspectRatio: data.aspectRatio,
    imageSize: data.imageSize,
    batchCount: data.batchCount,
    referenceImageIds: data.referenceImageIds,
    imageAssetId: data.imageAssetId,
    imageUrl: data.imageUrl && !isDataUrl(data.imageUrl) ? data.imageUrl : undefined,
    color: data.color,
    referenceImages: undefined,
    referenceImage: undefined,
    isLoading: false,
    error: undefined,
  };
}

function sanitizeNodeForSnapshot(node: CanvasNode): CanvasNode {
  return {
    id: node.id,
    type: node.type,
    position: {
      x: node.position.x,
      y: node.position.y,
    },
    data: sanitizeNodeDataForSnapshot(node.data),
  };
}

function sanitizeEdgeForSnapshot(edge: Edge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
  };
}

export function createHistorySnapshot(state: PersistedCanvasState): HistoryCanvasState {
  return {
    nodes: state.nodes.map(sanitizeNodeForSnapshot),
    edges: state.edges.map(sanitizeEdgeForSnapshot),
  };
}

export function areHistoryStatesEqual(
  left: HistoryCanvasState,
  right: HistoryCanvasState
) {
  return deepEqual(left, right);
}

function collectReferencedAssetIds(nodes: CanvasNode[]): Set<string> {
  const ids = new Set<string>();

  nodes.forEach((node) => {
    node.data.referenceImageIds?.forEach((id) => ids.add(id));
    if (node.data.imageAssetId) {
      ids.add(node.data.imageAssetId);
    }
  });

  return ids;
}

export function collectReferencedAssetIdsFromHistory(states: HistoryStateLike[]): Set<string> {
  const ids = new Set<string>();

  states.forEach((state) => {
    collectReferencedAssetIds(state.nodes).forEach((id) => ids.add(id));
  });

  return ids;
}

export function pruneAssets(
  assets: Record<string, CanvasImageAsset>,
  referencedAssetIds: Set<string>
) {
  return Object.fromEntries(
    Object.entries(assets).filter(([id]) => referencedAssetIds.has(id))
  );
}

export function createPersistedSnapshot(state: PersistedCanvasState): PersistedCanvasState {
  return {
    ...createHistorySnapshot({
      nodes: state.nodes,
      edges: state.edges,
      assets: state.assets,
    }),
    assets: state.assets,
  };
}

export function normalizeNodeDataWithAssets(
  data: CanvasNodeData,
  existingAssets: Record<string, CanvasImageAsset>
): { data: CanvasNodeData; assets: Record<string, CanvasImageAsset> } {
  let assets = existingAssets;
  const nextData: CanvasNodeData = { ...data };
  const nextReferenceImageIds = [...(nextData.referenceImageIds ?? [])].slice(0, 4);
  const ensureMutableAssets = () => {
    if (assets === existingAssets) {
      assets = { ...existingAssets };
    }

    return assets;
  };
  const storeAsset = (image: InlineImageData) => {
    const asset = createImageAsset(image);
    ensureMutableAssets()[asset.id] = asset;
    return asset.id;
  };

  if (nextData.referenceImages?.length) {
    nextReferenceImageIds.push(
      ...nextData.referenceImages
        .slice(0, Math.max(0, 4 - nextReferenceImageIds.length))
        .map((image) => storeAsset(image))
    );
  }

  if (nextData.referenceImage && nextReferenceImageIds.length < 4) {
    nextReferenceImageIds.push(storeAsset(nextData.referenceImage));
  }

  nextData.referenceImageIds = nextReferenceImageIds.length > 0 ? nextReferenceImageIds : undefined;

  if (!nextData.imageAssetId && nextData.imageUrl && isDataUrl(nextData.imageUrl)) {
    const imageAsset = imageAssetFromDataUrl(nextData.imageUrl);
    if (imageAsset) {
      ensureMutableAssets()[imageAsset.id] = imageAsset;
      nextData.imageAssetId = imageAsset.id;
      nextData.imageUrl = undefined;
    }
  }

  nextData.referenceImages = undefined;
  nextData.referenceImage = undefined;
  nextData.isLoading = nextData.isLoading ?? false;

  return {
    data: nextData,
    assets,
  };
}

export function migrateCanvasNodesToAssetIds(
  nodes: CanvasNode[],
  existingAssets: Record<string, CanvasImageAsset>
): { nodes: CanvasNode[]; assets: Record<string, CanvasImageAsset> } {
  const assets = { ...existingAssets };

  const migratedNodes = nodes.map((node) => {
    const normalized = normalizeNodeDataWithAssets(node.data, assets);
    Object.assign(assets, normalized.assets);

    return {
      ...node,
      data: {
        ...normalized.data,
        isLoading: false,
        error: undefined,
      },
    };
  });

  return {
    nodes: migratedNodes,
    assets,
  };
}
