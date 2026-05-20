const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const IMAGE_EXTENSION_ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
};

function inferImageExtension(imageUrl?: string): string {
  if (!imageUrl) {
    return 'png';
  }

  const dataUrlMime = imageUrl.match(/^data:(image\/[^;,]+)[;,]/i)?.[1]?.toLowerCase();
  if (dataUrlMime && IMAGE_EXTENSION_BY_MIME[dataUrlMime]) {
    return IMAGE_EXTENSION_BY_MIME[dataUrlMime];
  }

  const path = imageUrl.split(/[?#]/, 1)[0] ?? '';
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return (extension && IMAGE_EXTENSION_ALIASES[extension]) || 'png';
}

export function buildImageDownloadFileName(now = Date.now(), imageUrl?: string): string {
  return `banana-art-${now}.${inferImageExtension(imageUrl)}`;
}
