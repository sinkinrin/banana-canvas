import type { LogLevel } from '../lib/diagnostics';

export type AppLogEvent = { level: LogLevel; module: string; message: string; requestId?: string; details?: unknown };
const originalConsole = { debug: console.debug.bind(console), info: console.info.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) };
const secrets = new Set<string>();
const privateTexts = new Map<string, number>();
export function protectLogText(value: string) {
  if (value) privateTexts.set(value, (privateTexts.get(value) ?? 0) + 1);
  return () => {
    const count = privateTexts.get(value) ?? 0;
    if (count <= 1) privateTexts.delete(value); else privateTexts.set(value, count - 1);
  };
}
let sink: ((entry: AppLogEvent) => void) | undefined;

export function rememberLogSecrets(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    if (/key|token|secret|password|authorization/i.test(key) && typeof value === 'string' && value) {
      secrets.add(value);
      secrets.add(encodeURIComponent(value));
    }
  }
}
export function redactLogText(value: string) {
  let text = value;
  for (const secret of [...secrets, ...privateTexts.keys()].sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join('[REDACTED]');
    const escaped = JSON.stringify(secret).slice(1, -1);
    if (escaped !== secret) text = text.split(escaped).join('[REDACTED]');
  }
  return text
    .replace(/data:image\/[^\s"']+/gi, '[IMAGE]')
    .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, '[BINARY]')
    .replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|authorization|password|access_token|refresh_token|secret)\s*[=:]\s*["']?)[^\s"',;}]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s<>"')]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        url.username = ''; url.password = ''; url.search = ''; url.hash = '';
        return url.toString();
      } catch { return '[URL]'; }
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .slice(0, 8000);
}
export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]';
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown; status?: unknown };
    return sanitizeLogValue({ name: error.name, message: error.message, code: error.code, status: error.status, stack: error.stack, cause: error.cause }, depth + 1);
  }
  if (typeof value === 'string') return redactLogText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeLogValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key,
      /^(?:.*(?:api.?key|token|password|secret|authorization|cookie).*|prompt|contents?|body|responseText|headers|images?|data|input)$/i.test(key)
        ? '[REDACTED]' : sanitizeLogValue(item, depth + 1),
    ]));
  }
  return undefined;
}
export function setAppLogSink(next: typeof sink) { sink = next; }
export function appLog(level: LogLevel, module: string, message: string, details?: unknown, requestId?: string) {
  const entry: AppLogEvent = { level, module: redactLogText(module), message: redactLogText(message),
    details: sanitizeLogValue(details), requestId: requestId ? redactLogText(requestId) : undefined };
  if (sink) sink(entry);
  else if (level !== 'debug') originalConsole[level](`[${module}] ${entry.message}`, entry.details ?? '');
}
export function installConsoleLogging() {
  for (const level of ['debug', 'info', 'warn', 'error', 'log'] as const) {
    console[level] = (...args: unknown[]) => {
      const first = typeof args[0] === 'string' ? args.shift() as string : 'Console output';
      const tag = first.match(/^\[([^\]]+)\]/)?.[1] ?? 'main';
      const requestId = tag.match(/^(?:image2|generate-image):(.+)$/)?.[1];
      const module = tag.startsWith('image2') ? 'image2' : tag.startsWith('generate-image') ? 'generation'
        : tag.includes('cutout') ? 'cutout' : tag.includes('update') ? 'updates' : tag.split(':')[0];
      appLog(level === 'log' ? 'info' : level, module, first, args.length ? args : undefined, requestId);
    };
  }
}
export function printLog(entry: AppLogEvent) {
  originalConsole[entry.level](`[${entry.level}] [${entry.module}] ${entry.message}`, entry.details ?? '');
}
