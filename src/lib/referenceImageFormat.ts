/** Inspect bytes, not a filename or a browser-supplied MIME type. No pixel decoding here. */
export type ReferenceImageFormat = {
  mimeType: string;
  bytes: Uint8Array;
  convert: boolean;
  primaryFrame: boolean;
};

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function inspectReferenceImage(bytes: Uint8Array): ReferenceImageFormat {
  const result = (mimeType: string, convert = false, primaryFrame = false, output = bytes) =>
    ({ mimeType, convert, primaryFrame, bytes: output });
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    let components = 3;
    const parts: Uint8Array[] = [bytes.subarray(0, 2)];
    let mpf = false;
    let end = 0;
    while (offset < bytes.length) {
      const start = offset;
      if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9) { parts.push(bytes.subarray(start, offset)); end = offset; break; }
      if (offset + 2 > bytes.length) throw new Error('Truncated JPEG segment');
      const length = bytes[offset] * 256 + bytes[offset + 1];
      const next = offset + length;
      if (length < 2 || next > bytes.length) throw new Error('Invalid JPEG segment length');
      const isMpf = marker === 0xe2 && ascii(bytes, offset + 2, 4) === 'MPF\0';
      if (isMpf) mpf = true;
      else parts.push(bytes.subarray(start, next));
      if ([0xc0, 0xc1, 0xc2].includes(marker)) components = bytes[offset + 7];
      offset = next;
      if (marker === 0xda) {
        // Entropy data may contain escaped FF bytes, restart markers and more progressive scans.
        const scanStart = offset;
        while (offset < bytes.length) {
          if (bytes[offset] !== 0xff) { offset++; continue; }
          let codeOffset = offset + 1;
          while (bytes[codeOffset] === 0xff) codeOffset++;
          const code = bytes[codeOffset];
          if (code === 0 || (code >= 0xd0 && code <= 0xd7)) { offset = codeOffset + 1; continue; }
          break;
        }
        parts.push(bytes.subarray(scanStart, offset));
      }
    }
    if (!end) throw new Error('Missing JPEG end marker');
    if (!mpf) return result('image/jpeg', components !== 3);
    // Keep the first JPEG's original compressed pixels, EXIF orientation and ICC profile.
    // Drop MPF directory segments and everything after its EOI (secondary images/trailers).
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let cursor = 0;
    for (const part of parts) { output.set(part, cursor); cursor += part.length; }
    return result('image/jpeg', components !== 3, true, output);
  }
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
    if (bytes.length < 33) throw new Error('Truncated PNG');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let animated = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset);
      if (offset + size + 12 > bytes.length) throw new Error('Truncated PNG chunk');
      if (ascii(bytes, offset + 4, 4) === 'acTL') animated = true;
      offset += size + 12;
    }
    return result('image/png', animated || bytes[24] !== 8 || ![2, 6].includes(bytes[25]), animated);
  }
  if (['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return result('image/gif', true, true);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const animated = ascii(bytes, 12, 4) === 'VP8X' && Boolean(bytes[20] & 2);
    return result('image/webp', animated, animated);
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brands = ascii(bytes, 8, Math.min(56, bytes.length - 8));
    if (/avif|avis/.test(brands)) return result('image/avif', true, brands.includes('avis'));
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(brands)) return result('image/heic', true);
  }
  throw new Error('Unrecognized image format');
}

export function base64ToBytes(data: string) {
  return Uint8Array.from(atob(data), char => char.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join(''));
}
