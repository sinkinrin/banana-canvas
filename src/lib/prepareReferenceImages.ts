import type { ReferenceImageInput } from './imageModels';
import { base64ToBytes, bytesToBase64, inspectReferenceImage } from './referenceImageFormat';
import { MAX_REFERENCE_IMAGE_BYTES, MAX_TOTAL_INPUT_IMAGE_BYTES, decodedBase64ByteLength } from './imageInputLimits';
import i18n from '../i18n';

export async function convertReferenceToPng(bytes: Uint8Array, mimeType: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  // ImageBitmap decodes the default/first frame, applies EXIF orientation and color management.
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mimeType }));
  const canvas = document.createElement('canvas');
  try {
    signal?.throwIfAborted();
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion unavailable');
    context.drawImage(bitmap, 0, 0);
    const url = canvas.toDataURL('image/png');
    if (!url.startsWith('data:image/png;base64,')) throw new Error('Image dimensions unsupported');
    return { data: url.slice('data:image/png;base64,'.length), mimeType: 'image/png' };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function prepareReferenceImages(
  images: ReferenceImageInput[],
  signal?: AbortSignal,
  convert = convertReferenceToPng,
): Promise<ReferenceImageInput[]> {
  const prepared: ReferenceImageInput[] = [];
  let total = 0;
  for (const [index, image] of images.entries()) {
    signal?.throwIfAborted();
    const originalSize = decodedBase64ByteLength(image.data);
    if (!originalSize || originalSize > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(i18n.t('errors.referenceSize', { index: index + 1 }));
    }
    let output: ReferenceImageInput;
    try {
      const bytes = base64ToBytes(image.data);
      const format = inspectReferenceImage(bytes);
      output = format.convert
        ? await convert(format.bytes, format.mimeType, signal)
        : { data: format.bytes === bytes ? image.data : bytesToBase64(format.bytes), mimeType: format.mimeType };
    } catch {
      signal?.throwIfAborted();
      throw new Error(i18n.t('errors.referenceFormat', { index: index + 1 }));
    }
    signal?.throwIfAborted();
    const size = decodedBase64ByteLength(output.data);
    if (!size || size > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(i18n.t('errors.referenceConvertedSize', { index: index + 1 }));
    }
    total += size;
    if (total > MAX_TOTAL_INPUT_IMAGE_BYTES) throw new Error(i18n.t('errors.referenceTotalSize'));
    prepared.push(output);
  }
  return prepared;
}
