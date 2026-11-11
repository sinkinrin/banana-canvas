import type { ImageModelId } from '../../lib/imageModels';
import { isOfficialImageModel, type OfficialImageOptions } from '../../lib/officialImages';

// Older projects may combine batch requests with multiple results per request.
export function getPromptImageCount(model: ImageModelId, batchCount: number, options?: OfficialImageOptions) {
  return batchCount * (isOfficialImageModel(model) ? options?.n ?? 1 : 1);
}

export function promptImageCountPatch(model: ImageModelId, count: number, options?: OfficialImageOptions) {
  if (!isOfficialImageModel(model)) return { batchCount: count };
  const next = { ...options };
  delete next.n;
  return { batchCount: count, officialImageOptions: next };
}
