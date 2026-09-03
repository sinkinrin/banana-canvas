export const MEBIBYTE_BYTES = 1024 * 1024;

export const MAX_REFERENCE_IMAGE_BYTES = 16 * MEBIBYTE_BYTES;
export const MAX_TOTAL_INPUT_IMAGE_BYTES = 40 * MEBIBYTE_BYTES;
export const MAX_JSON_REQUEST_BODY_BYTES = 64 * MEBIBYTE_BYTES;

export function formatMebibytes(bytes: number) {
  const mebibytes = bytes / MEBIBYTE_BYTES;
  const rounded = Math.ceil(mebibytes * 100) / 100;
  return `${rounded} MiB`;
}

export function decodedBase64ByteLength(value: string): number | null {
  if (!value || value.trim() !== value) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  if (value.length % 4 === 1) return null;

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (padding > 0 && value.length % 4 !== 0) return null;

  const byteLength = Math.floor(value.length * 3 / 4) - padding;
  return byteLength > 0 ? byteLength : null;
}
