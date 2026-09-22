import type { ReferenceImageInput } from '../lib/imageModels';
import { inspectReferenceImage } from '../lib/referenceImageFormat';
import { ImageInputError } from './imageInputError';

/** Also covers saved projects and API callers that have not run renderer preparation. */
export function extractReferencePrimaryImages(images: ReferenceImageInput[]) {
  return images.map((image, index) => {
    const bytes = Buffer.from(image.data, 'base64');
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return image;
    try {
      const format = inspectReferenceImage(bytes);
      return { data: format.primaryFrame ? Buffer.from(format.bytes).toString('base64') : image.data, mimeType: format.mimeType };
    } catch {
      throw new ImageInputError(index + 1);
    }
  });
}
