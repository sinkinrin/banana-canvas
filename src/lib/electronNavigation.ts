export function isInternalAppUrl(candidateUrl: string, localUrl: string) {
  try {
    return new URL(candidateUrl).origin === new URL(localUrl).origin;
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(candidateUrl: string) {
  try {
    const protocol = new URL(candidateUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
