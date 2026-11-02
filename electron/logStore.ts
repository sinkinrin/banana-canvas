import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DiagnosticsState, LogEntry, LogMode, LogPage, LogQuery } from '../src/lib/diagnostics';
import { type AppLogEvent, sanitizeLogValue } from '../src/server/appLog';

export class LogStore {
  readonly sessionId = randomUUID();
  private mode: LogMode = 'normal';
  private revision = 0;
  private writeError = false;
  private bytes = 0;
  private readonly preferences: string;
  constructor(readonly directory: string, private maxBytes = 10 * 1024 * 1024, private fileCount = 5) {
    this.preferences = path.join(directory, 'preferences.json');
    try {
      fs.mkdirSync(directory, { recursive: true });
      try { this.mode = JSON.parse(fs.readFileSync(this.preferences, 'utf8')).mode === 'debug' ? 'debug' : 'normal'; } catch { /* First launch. */ }
      this.bytes = fs.existsSync(this.file(0)) ? fs.statSync(this.file(0)).size : 0;
    } catch { this.writeError = true; }
  }
  private file(index: number) { return path.join(this.directory, index ? `app.${index}.log` : 'app.log'); }
  state(): DiagnosticsState { return { mode: this.mode, sessionId: this.sessionId, revision: this.revision, writeError: this.writeError }; }
  setMode(mode: LogMode) {
    if (mode !== 'normal' && mode !== 'debug') throw new Error('Invalid log mode');
    if (mode === this.mode) return this.state();
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(this.preferences + '.tmp', JSON.stringify({ mode }), { mode: 0o600 });
    fs.renameSync(this.preferences + '.tmp', this.preferences);
    const previous = this.mode;
    this.mode = mode;
    this.write({ level: 'info', module: 'settings', message: 'Log mode changed', details: { previous, current: mode } });
    return this.state();
  }
  write(event: AppLogEvent) {
    if (event.level === 'debug' && this.mode !== 'debug') return;
    const entry: LogEntry = { ...sanitizeLogValue(event) as AppLogEvent,
      id: `${this.sessionId}:${++this.revision}`, time: new Date().toISOString(), sessionId: this.sessionId };
    let line = JSON.stringify(entry);
    if (Buffer.byteLength(line) > 32 * 1024) line = JSON.stringify({ ...entry, details: '[TRUNCATED]' });
    line += '\n';
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      if (this.bytes + Buffer.byteLength(line) > this.maxBytes && this.bytes > 0) {
        fs.rmSync(this.file(this.fileCount - 1), { force: true });
        for (let i = this.fileCount - 2; i >= 0; i--) {
          if (fs.existsSync(this.file(i))) fs.renameSync(this.file(i), this.file(i + 1));
        }
        this.bytes = 0;
      }
      fs.appendFileSync(this.file(0), line, { mode: 0o600 });
      this.bytes += Buffer.byteLength(line);
      this.writeError = false;
    } catch { this.writeError = true; } // Logging must not interrupt generation or saving.
  }
  async query(query: LogQuery = {}): Promise<LogPage> {
    const entries: LogEntry[] = [];
    let beforeFound = !query.before;
    const needle = query.search?.toLowerCase().slice(0, 256);
    for (let i = 0; i < this.fileCount; i++) {
      let lines: string[];
      try { lines = (await fs.promises.readFile(this.file(i), 'utf8')).split('\n'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      for (let j = lines.length - 1; j >= 0; j--) {
        let entry: LogEntry;
        try { entry = JSON.parse(lines[j]); } catch { continue; }
        if (!entry.id || !entry.time) continue;
        if (!beforeFound) { if (entry.id === query.before) beforeFound = true; continue; }
        if (query.session !== 'all' && entry.sessionId !== this.sessionId) continue;
        if (query.level && entry.level !== query.level) continue;
        if (query.module && entry.module !== query.module) continue;
        if (needle && !JSON.stringify(entry).toLowerCase().includes(needle)) continue;
        if (entries.some((item) => item.id === entry.id)) continue;
        if (entries.length === 200) return { entries: entries.reverse(), hasMore: true };
        entries.push(entry);
      }
    }
    return { entries: entries.reverse(), hasMore: false };
  }
  async exportTo(destination: string, environment: Record<string, unknown>) {
    const output = await fs.promises.open(destination, 'w', 0o600);
    try {
      await output.write(JSON.stringify({ diagnosticEnvironment: sanitizeLogValue(environment), exportedAt: new Date().toISOString() }) + '\n');
      for (let i = this.fileCount - 1; i >= 0; i--) {
        let data: string;
        try { data = await fs.promises.readFile(this.file(i), 'utf8'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        await output.write(data);
      }
    } finally { await output.close(); }
  }
}
