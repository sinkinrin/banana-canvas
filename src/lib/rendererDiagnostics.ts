import { getDiagnosticsBridge } from './diagnostics';

export function installRendererDiagnostics() {
  const bridge = getDiagnosticsBridge();
  if (!bridge) return;
  const detail = (error: unknown) => error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : typeof error === 'string' ? error.slice(0, 8000) : 'Non-error rejection';
  window.addEventListener('error', (event) => bridge.report({ level: 'error', message: 'Uncaught renderer error', details: detail(event.error ?? event.message) }));
  window.addEventListener('unhandledrejection', (event) => bridge.report({ level: 'error', message: 'Unhandled renderer rejection', details: detail(event.reason) }));
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      bridge.report({ level, message: typeof args[0] === 'string' ? args[0] : 'Renderer console error', details: args.slice(1, 5).map(detail) });
    };
  }
}
