import { getBananaImageSizeValues, isBananaImageModel, isImageModelId, type ImageModelId, type BananaAspectRatio, type BananaImageSize } from './imageModels';
import type { CanvasNode } from './canvasState';
import { getPromptAspectRatioOptions } from '../components/nodes/promptAspectRatios';

export type ComparisonSelection = { models: ImageModelId[]; aspectRatio: BananaAspectRatio; imageSize: BananaImageSize };
const COMPARISON_PREFERENCES_KEY = 'banana-comparison-preferences';

export function getDesktopComparisonBridge() {
  return (globalThis as typeof globalThis & { bananaDesktop?: { comparison?: {
    get: () => Promise<unknown>; set: (selection: ComparisonSelection) => Promise<void>;
  } } }).bananaDesktop?.comparison;
}

export function readComparisonSelection(fallback: Partial<ComparisonSelection> = {}): ComparisonSelection {
  let saved: Partial<ComparisonSelection> = {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COMPARISON_PREFERENCES_KEY) ?? 'null');
    if (value && typeof value === 'object') saved = value;
  } catch { /* Use node defaults when preferences are unavailable. */ }
  return normalizeComparisonSelection(saved, fallback);
}

export function normalizeComparisonSelection(value: unknown, fallback: Partial<ComparisonSelection> = {}): ComparisonSelection {
  const saved = value && typeof value === 'object' ? value as Partial<ComparisonSelection> : {};
  const savedModels = normalizeComparisonModels(saved.models);
  const models = savedModels.length >= 2 ? savedModels : ['image2.5-flare', 'image2.5-sunburst'] as ImageModelId[];
  const options = getComparisonOptions(models);
  const ratio = saved.aspectRatio ?? fallback.aspectRatio;
  const size = saved.imageSize ?? fallback.imageSize;
  return {
    models,
    aspectRatio: ratio && options.ratios.includes(ratio) ? ratio : '1:1',
    imageSize: size && options.sizes.includes(size) ? size : '1K',
  };
}

export async function saveComparisonSelection(selection: ComparisonSelection): Promise<void> {
  try {
    localStorage.setItem(COMPARISON_PREFERENCES_KEY, JSON.stringify(selection));
  } catch { /* Preference storage must not prevent generation. */ }
  await getDesktopComparisonBridge()?.set(selection);
}

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
