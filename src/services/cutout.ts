import i18n from '../i18n';
import { CUTOUT_INPUT_SIZE, getCutoutBridge, getCutoutModel, type CutoutModelId } from '../lib/cutoutModels';
import { normalizeCutoutPixels } from '../lib/cutoutPixels';

export function cutoutErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = ['CANCELLED', 'BUSY', 'DOWNLOAD_BUSY', 'MODEL_MISSING', 'MODEL_CORRUPT', 'INFERENCE_TIMEOUT', 'IMAGE_TOO_LARGE', 'DESKTOP_ONLY'].find((value) => message.includes(value));
  return i18n.t(`cutout.errors.${code ?? 'FAILED'}`);
}

export async function removeImageBackground(url: string, modelId: CutoutModelId, requestId: string, signal: AbortSignal) {
  const bridge = getCutoutBridge();
  if (!bridge) throw new Error('DESKTOP_ONLY');
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  signal.throwIfAborted();
  if (image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error('IMAGE_TOO_LARGE');
  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = inputCanvas.height = CUTOUT_INPUT_SIZE;
  const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true });
  if (!inputContext) throw new Error('INVALID_IMAGE');
  inputContext.imageSmoothingQuality = 'high';
  inputContext.drawImage(image, 0, 0, CUTOUT_INPUT_SIZE, CUTOUT_INPUT_SIZE);
  const input = normalizeCutoutPixels(inputContext.getImageData(0, 0, CUTOUT_INPUT_SIZE, CUTOUT_INPUT_SIZE).data, getCutoutModel(modelId).family);
  const abort = () => { void bridge.cancel(requestId).catch(() => {}); };
  signal.throwIfAborted();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const alpha = await bridge.run({ input, requestId, modelId });
    signal.throwIfAborted();
    const mask = inputContext.createImageData(CUTOUT_INPUT_SIZE, CUTOUT_INPUT_SIZE);
    for (let i = 0; i < alpha.length; i++) mask.data[i * 4 + 3] = alpha[i];
    inputContext.putImageData(mask, 0, 0);
    const result = document.createElement('canvas');
    result.width = image.naturalWidth;
    result.height = image.naturalHeight;
    const context = result.getContext('2d');
    if (!context) throw new Error('INVALID_IMAGE');
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = 'destination-in';
    context.imageSmoothingQuality = 'high';
    context.drawImage(inputCanvas, 0, 0, result.width, result.height);
    return result.toDataURL('image/png');
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
