export function createOpenAiEditMaskPixels(source: Uint8ClampedArray) {
  const result = new Uint8ClampedArray(source.length);

  for (let index = 0; index < source.length; index += 4) {
    const paintedAlpha = source[index + 3] ?? 0;
    result[index] = 255;
    result[index + 1] = 255;
    result[index + 2] = 255;
    result[index + 3] = 255 - paintedAlpha;
  }

  return result;
}
