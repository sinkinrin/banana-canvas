import { CUTOUT_INPUT_SIZE, type CutoutModel } from './cutoutModels';

export function normalizeCutoutPixels(pixels: Uint8ClampedArray, family: CutoutModel['family']) {
  const count = CUTOUT_INPUT_SIZE ** 2;
  if (pixels.length !== count * 4) throw new Error('INVALID_IMAGE');
  const result = new Float32Array(count * 3);
  let max = 1;
  if (family === 'isnet') {
    for (let i = 0; i < pixels.length; i += 4) max = Math.max(max, pixels[i], pixels[i + 1], pixels[i + 2]);
  }
  const means = family === 'isnet' ? [0.5, 0.5, 0.5] : [0.485, 0.456, 0.406];
  const stds = family === 'isnet' ? [1, 1, 1] : [0.229, 0.224, 0.225];
  const divisor = family === 'isnet' ? max : 255;
  for (let i = 0; i < count; i++) {
    for (let channel = 0; channel < 3; channel++) {
      result[channel * count + i] = (pixels[i * 4 + channel] / divisor - means[channel]) / stds[channel];
    }
  }
  return result;
}

export function cutoutAlpha(values: Float32Array, family: CutoutModel['family']) {
  if (values.length !== CUTOUT_INPUT_SIZE ** 2) throw new Error('INVALID_MASK');
  let min = Infinity;
  let max = -Infinity;
  const probabilities = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const value = family === 'birefnet' ? 1 / (1 + Math.exp(-values[i])) : values[i];
    if (!Number.isFinite(value)) throw new Error('INVALID_MASK');
    probabilities[i] = value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = max - min;
  return Uint8Array.from(probabilities, (value) => Math.round(Math.max(0, Math.min(1, range > 1e-8 ? (value - min) / range : value)) * 255));
}
