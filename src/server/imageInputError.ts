/** Only allowlisted, structured input errors may be returned to the renderer. */
export class ImageInputError extends Error {
  constructor(public readonly imageIndex?: number) {
    super('The image provider rejected a reference image.');
  }
}

export function parseImageInputError(payload: unknown): ImageInputError | undefined {
  if (!payload || typeof payload !== 'object') return;
  const error = (payload as { error?: { code?: unknown; message?: unknown } }).error;
  if (error?.code !== 'invalid_image_file') return;
  const match = typeof error.message === 'string' ? error.message.match(/\bfor image ([1-4])\b/i) : null;
  return new ImageInputError(match ? Number(match[1]) : undefined);
}
