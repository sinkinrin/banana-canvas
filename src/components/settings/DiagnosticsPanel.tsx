import { useEffect, useRef, useState } from 'react';
import { getDiagnosticsBridge, LOG_LEVELS, type DiagnosticsState, type LogEntry, type LogQuery } from '../../lib/diagnostics';
import { useAppTranslation } from '../../i18n';

const control = 'rounded-lg border border-[#F2C14E]/20 bg-[#141210] px-3 py-2 text-sm text-[#EEE4CE] disabled:opacity-40';
const modules = ['settings', 'startup', 'shutdown', 'generation', 'gemini', 'image2', 'optimizer', 'projects', 'prompts', 'updates', 'cutout', 'renderer', 'main'];

export function DiagnosticsPanel() {
  const { t } = useAppTranslation();
  const [bridge] = useState(getDiagnosticsBridge);
  const [state, setState] = useState<DiagnosticsState>();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [query, setQuery] = useState<LogQuery>({ session: 'current' });
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const lastRevision = useRef(-1);
  const follow = useRef(true);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const timer = setTimeout(() => setQuery((old) => ({ ...old, search })), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let running = false;
    const token = ++generation.current;
    lastRevision.current = -1;
    const refresh = async (initial = false) => {
      if (running || (!initial && pausedRef.current)) return;
      running = true;
      try {
        const next = await bridge.state();
        if (!active) return;
        setState(next);
        if (initial || next.revision !== lastRevision.current) {
          const page = await bridge.query(query);
          if (!active || token !== generation.current || (!initial && pausedRef.current)) return;
          setEntries(page.entries); setHasMore(page.hasMore); lastRevision.current = next.revision;
        }
      } catch { if (active) setNotice(t('logs.failed')); }
      finally { running = false; }
    };
    void refresh(true);
    const timer = setInterval(() => { void refresh(); }, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [bridge, query]);
  useEffect(() => {
    if (follow.current && !paused && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries, paused]);

  if (!bridge) return <div className="p-6 text-sm text-[#96836F]">{t('logs.desktopOnly')}</div>;

  const action = async (fn: () => Promise<unknown>, success?: string) => {
    setNotice(''); setBusy(true);
    try { const result = await fn(); if (success && result !== false) setNotice(success); }
    catch { setNotice(t('logs.failed')); }
    finally { setBusy(false); }
  };
  const older = async () => {
    // Switching to history must not trigger a replacement with the newest page.
    follow.current = false;
    const token = generation.current;
    const page = await bridge.query({ ...query, before: entries[0]?.id });
    if (token !== generation.current) return;
    setEntries((old) => [...page.entries, ...old].slice(0, 2000)); setHasMore(page.hasMore);
  };
  return <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5" data-diagnostics-panel="true">
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm">{t('logs.mode')} <select data-log-mode="true" className={control} value={state?.mode ?? 'normal'} disabled={busy || !state}
        onChange={(event) => { const mode = event.target.value as 'normal' | 'debug'; void action(async () => setState(await bridge.setMode(mode))); }}>
        <option value="normal">{t('logs.normal')}</option><option value="debug">Debug</option>
      </select></label>
      <button className={control} disabled={busy} onClick={() => void action(bridge.openFolder)}>{t('logs.folder')}</button>
      <button data-log-export="true" className={control} disabled={busy} onClick={() => void action(bridge.exportLogs, t('logs.exported'))}>{t('logs.export')}</button>
    </div>
    <p className="text-xs text-[#96836F]">{t('logs.hint')}</p>
    {state?.writeError && <p role="alert" className="text-sm text-red-300">{t('logs.writeFailed')}</p>}
    <div className="flex flex-wrap gap-2">
      <select aria-label={t('logs.session')} className={control} value={query.session} onChange={(e) => setQuery({ ...query, session: e.target.value as 'current' | 'all' })}>
        <option value="current">{t('logs.current')}</option><option value="all">{t('logs.history')}</option>
      </select>
      <select aria-label={t('logs.level')} className={control} value={query.level ?? ''} onChange={(e) => setQuery({ ...query, level: e.target.value })}>
        <option value="">{t('logs.allLevels')}</option>{LOG_LEVELS.map((level) => <option key={level} value={level}>{level.toUpperCase()}</option>)}
      </select>
      <select aria-label={t('logs.module')} className={control} value={query.module ?? ''} onChange={(e) => setQuery({ ...query, module: e.target.value })}>
        <option value="">{t('logs.allModules')}</option>{modules.map((module) => <option key={module} value={module}>{t(`logs.modules.${module}`)}</option>)}
      </select>
      <input data-log-search="true" className={`${control} min-w-40 flex-1`} aria-label={t('logs.search')} placeholder={t('logs.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <button data-log-pause="true" className={control} onClick={() => { follow.current = paused; if (paused) lastRevision.current = -1; setPaused(!paused); }}>{t(paused ? 'logs.resume' : 'logs.pause')}</button>
    </div>
    <p className="text-xs text-[#96836F]">{t(paused ? 'logs.paused' : 'logs.live')} · {t('logs.count', { count: entries.length })}</p>
    {notice && <p role="status" className="text-sm text-[#F2C14E]">{notice}</p>}
    <div ref={list} data-log-list="true" className="h-80 min-h-40 shrink-0 overflow-auto rounded-lg border border-[#F2C14E]/15 bg-[#100F0C] p-2 font-mono text-xs"
      onScroll={(event) => { const el = event.currentTarget; if (!paused && el.scrollHeight - el.scrollTop - el.clientHeight > 40) { follow.current = false; setPaused(true); } }}
      onWheel={(event) => { if (event.deltaY < 0 && !paused) { follow.current = false; setPaused(true); } }}>
      {hasMore && <button className={`${control} mb-2 w-full`} disabled={busy || !paused} onClick={() => void action(older)}>{t(paused ? 'logs.older' : 'logs.pauseForHistory')}</button>}
      {!entries.length && <p className="p-4 text-[#96836F]">{t('logs.empty')}</p>}
      {entries.map((entry) => <details key={entry.id} data-log-entry="true" className="border-b border-white/5 py-2">
        <summary className={`cursor-pointer break-words ${entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-amber-300' : entry.level === 'debug' ? 'text-[#96836F]' : 'text-[#EEE4CE]'}`}>
          <time>{new Date(entry.time).toLocaleString()}</time> {entry.level.toUpperCase()} [{entry.module}] {entry.message}
          {entry.requestId && <span className="ml-2 text-[#96836F]">{entry.requestId}</span>}
        </summary>
        <pre className="my-2 whitespace-pre-wrap break-all text-[#C5BAA5]">{JSON.stringify(entry, null, 2)}</pre>
        <div className="flex gap-2">
          <button className={control} onClick={() => void action(() => navigator.clipboard.writeText(JSON.stringify(entry, null, 2)), t('common.copied'))}>{t('logs.copy')}</button>
          {entry.requestId && <button className={control} onClick={() => void action(() => navigator.clipboard.writeText(entry.requestId!), t('common.copied'))}>{t('logs.copyId')}</button>}
        </div>
      </details>)}
    </div>
  </div>;
}
