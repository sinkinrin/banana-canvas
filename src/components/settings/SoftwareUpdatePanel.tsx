import { useEffect, useState } from 'react';
import appI18n, { useAppTranslation } from '../../i18n';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
} from 'lucide-react';

import { APP_VERSION } from '../../lib/appVersion';
import {
  createUnavailableUpdateState,
  getDesktopUpdateBridge,
  type DesktopUpdateState,
} from '../../lib/desktopUpdates';

const RELEASES_URL = 'https://github.com/sinkinrin/banana-canvas/releases/latest';

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function describeUpdateState(state: DesktopUpdateState, language = 'zh-CN') {
  const t = appI18n.getFixedT(language);
  if (state.phase === 'checking') return t('updates.checking');
  if (state.phase === 'available') return t('updates.available', { version: state.latestVersion });
  if (state.phase === 'downloading') return t('updates.downloading', { version: state.latestVersion ?? '' }).trim();
  if (state.phase === 'downloaded') return t('updates.downloaded', { version: state.latestVersion });
  if (state.phase === 'up-to-date') return t('updates.upToDate');
  if (state.phase === 'error') return t('updates.error');
  return t('updates.notChecked');
}

export function SoftwareUpdatePanel() {
  const { t, i18n } = useAppTranslation();
  const [state, setState] = useState<DesktopUpdateState>(() =>
    createUnavailableUpdateState(APP_VERSION)
  );
  const [loaded, setLoaded] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string>();

  useEffect(() => {
    const bridge = getDesktopUpdateBridge();
    if (!bridge) {
      setLoaded(true);
      return;
    }

    let disposed = false;
    const subscriptionId = bridge.subscribe((nextState) => {
      if (!disposed) setState(nextState);
    });
    bridge.getState()
      .then((nextState) => {
        if (!disposed) setState(nextState);
      })
      .catch((error) => {
        if (!disposed) setActionError(error instanceof Error ? error.message : t('updates.readFailed'));
      })
      .finally(() => {
        if (!disposed) setLoaded(true);
      });

    return () => {
      disposed = true;
      bridge.unsubscribe(subscriptionId);
    };
  }, []);

  const runAction = async (action: () => Promise<DesktopUpdateState>) => {
    setActionPending(true);
    setActionError(undefined);
    try {
      setState(await action());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('updates.error'));
    } finally {
      setActionPending(false);
    }
  };

  const bridge = getDesktopUpdateBridge();
  const progress = state.progress;
  const busy = actionPending || state.phase === 'checking' || state.phase === 'downloading';
  const statusIsError = state.phase === 'error';
  const statusIsSuccess = state.phase === 'up-to-date' || state.phase === 'downloaded';

  return (
    <div data-software-update-panel="true" className="space-y-5 p-6">
      <section
        className="rounded-xl border p-5"
        style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">{t('updates.title')}</h3>
            <p className="mt-1 text-xs" style={{ color: '#96836F' }}>
              {t('updates.description')}
            </p>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
            style={{
              background: statusIsError
                ? 'rgba(217,123,58,0.12)'
                : statusIsSuccess
                  ? 'rgba(124,203,138,0.1)'
                  : 'rgba(242,193,78,0.09)',
              color: statusIsError ? '#D97B3A' : statusIsSuccess ? '#7CCB8A' : '#D7BC7C',
            }}
          >
            {busy
              ? <Loader2 size={13} className="animate-spin" />
              : statusIsError
                ? <AlertTriangle size={13} />
                : statusIsSuccess
                  ? <CheckCircle2 size={13} />
                  : <RefreshCw size={13} />}
            {loaded
              ? describeUpdateState(state, i18n.resolvedLanguage ?? i18n.language)
              : t('updates.loading')}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(242,193,78,0.12)', background: '#141210' }}>
            <p className="text-xs" style={{ color: '#96836F' }}>{t('updates.currentVersion')}</p>
            <p className="mt-1 text-xl font-semibold" style={{ color: '#EEE4CE' }}>v{state.currentVersion || APP_VERSION}</p>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(242,193,78,0.12)', background: '#141210' }}>
            <p className="text-xs" style={{ color: '#96836F' }}>{t('updates.latestVersion')}</p>
            <p className="mt-1 text-xl font-semibold" style={{ color: '#F2C14E' }}>
              {state.latestVersion ? `v${state.latestVersion}` : t('updates.pendingCheck')}
            </p>
          </div>
        </div>

        {state.supported ? (
          <label className="mt-4 flex items-start gap-3 rounded-lg border p-4" style={{ borderColor: 'rgba(242,193,78,0.12)' }}>
            <input
              type="checkbox"
              className="mt-0.5 accent-[#F2C14E]"
              checked={state.automaticUpdatesEnabled}
              disabled={actionPending}
              onChange={(event) => {
                const enabled = event.target.checked;
                if (!bridge) return;
                void runAction(() => bridge.setAutomaticUpdatesEnabled(enabled));
              }}
            />
            <span>
              <span className="block text-sm font-medium">{t('updates.automaticTitle')}</span>
              <span className="mt-1 block text-xs leading-5" style={{ color: '#96836F' }}>
                {t('updates.automaticDescription')}
              </span>
            </span>
          </label>
        ) : (
          <div className="mt-4 rounded-lg border px-4 py-3 text-xs leading-5" style={{ borderColor: 'rgba(217,123,58,0.22)', color: '#D9A06E', background: 'rgba(217,123,58,0.07)' }}>
            {t('updates.unavailable')}
          </div>
        )}

        {progress && state.phase === 'downloading' && (
          <div className="mt-4" aria-live="polite">
            <div className="mb-2 flex items-center justify-between text-xs" style={{ color: '#B8A58D' }}>
              <span>{t('updates.downloadedProgress', {
                transferred: formatBytes(progress.transferred),
                total: formatBytes(progress.total),
              })}</span>
              <span>{Math.round(progress.percent)}% · {formatBytes(progress.bytesPerSecond)}/s</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: '#2A251D' }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${progress.percent}%`, background: 'linear-gradient(90deg, #F2C14E, #D97B3A)' }}
              />
            </div>
          </div>
        )}

        {(actionError || state.error) && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'rgba(217,123,58,0.3)', color: '#D97B3A', background: 'rgba(217,123,58,0.08)' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{actionError || state.error}</span>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!state.supported || busy || !bridge}
            onClick={() => bridge && void runAction(() => bridge.checkForUpdates())}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            {state.phase === 'checking' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {t('updates.check')}
          </button>
          {state.phase === 'available' && (
            <button
              type="button"
              disabled={actionPending || !bridge}
              onClick={() => bridge && void runAction(() => bridge.downloadUpdate())}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-45"
              style={{ background: '#D97B3A', color: '#16130F' }}
            >
              <Download size={15} />
              {t('updates.download')}
            </button>
          )}
          {state.phase === 'downloaded' && (
            <button
              type="button"
              disabled={actionPending || !bridge}
              onClick={() => bridge && void runAction(() => bridge.installUpdate())}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-45"
              style={{ background: '#7CCB8A', color: '#132016' }}
            >
              <Rocket size={15} />
              {t('updates.install')}
            </button>
          )}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
            style={{ background: '#141210', color: '#B8A58D' }}
          >
            <ExternalLink size={14} />
            {t('updates.openReleases')}
          </a>
        </div>

        <p className="mt-4 text-xs leading-5" style={{ color: '#96836F' }}>
          {t('updates.unsignedWarning')}
        </p>
      </section>

      {(state.releaseName || state.releaseNotes) && (
        <section className="rounded-xl border p-5" style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}>
          <h3 className="font-semibold">{state.releaseName || t('updates.releaseNotesTitle', { version: state.latestVersion })}</h3>
          <div
            className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border p-4 text-sm leading-6"
            style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.1)', color: '#B8A58D' }}
          >
            {state.releaseNotes || t('updates.noReleaseNotes')}
          </div>
        </section>
      )}
    </div>
  );
}
