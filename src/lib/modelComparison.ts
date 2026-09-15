import { getBananaImageSizeValues, isBananaImageModel, isImageModelId, type ImageModelId, type BananaAspectRatio, type BananaImageSize } from './imageModels';
import type { CanvasNode } from './canvasState';
import { getPromptAspectRatioOptions } from '../components/nodes/promptAspectRatios';

export function normalizeComparisonModels(value: unknown): ImageModelId[] {
  return Array.isArray(value) ? [...new Set(value.filter(isImageModelId))] : [];
}

export function getComparisonOptions(models: ImageModelId[]) {
  const ratios: BananaAspectRatio[] = ['1:1', '4:3', '16:9', '3:4', '9:16'];
  const sizes: BananaImageSize[] = ['1K', '2K', '4K'];
  return {
    ratios: ratios.filter(ratio => models.every(model => getPromptAspectRatioOptions(model).includes(ratio))),
    sizes: sizes.filter(size => models.every(model => !isBananaImageModel(model) || getBananaImageSizeValues(model).includes(size))),
  };
}

export function markComparisonWinner(nodes: CanvasNode[], winnerId: string): CanvasNode[] {
  const winner = nodes.find(node => node.id === winnerId);
  const group = winner?.data.comparisonGroupId;
  if (!group || winner.data.isLoading || !(winner.data.imageAssetId || winner.data.imageUrl)) return nodes;
  return nodes.map(node => node.data.comparisonGroupId === group
    ? { ...node, data: { ...node.data, comparisonWinner: node.id === winnerId ? !winner.data.comparisonWinner || undefined : undefined } }
    : node);
}
