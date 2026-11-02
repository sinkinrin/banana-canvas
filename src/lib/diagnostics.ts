export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = typeof LOG_LEVELS[number];
export type LogMode = 'normal' | 'debug';
export type LogEntry = {
  id: string; time: string; sessionId: string; level: LogLevel;
  module: string; message: string; requestId?: string; details?: unknown;
};
export type LogQuery = {
  session?: 'current' | 'all'; level?: string; module?: string; search?: string; before?: string;
};
export type LogPage = { entries: LogEntry[]; hasMore: boolean };
export type DiagnosticsState = { mode: LogMode; sessionId: string; revision: number; writeError: boolean };
export type DiagnosticsBridge = {
  state: () => Promise<DiagnosticsState>;
  setMode: (mode: LogMode) => Promise<DiagnosticsState>;
  query: (query: LogQuery) => Promise<LogPage>;
  openFolder: () => Promise<void>;
  exportLogs: () => Promise<boolean>;
  report: (entry: { level: 'warn' | 'error'; message: string; details?: unknown }) => void;
};
export function getDiagnosticsBridge() {
  return (globalThis as typeof globalThis & { bananaDesktop?: { diagnostics?: DiagnosticsBridge } }).bananaDesktop?.diagnostics;
}
