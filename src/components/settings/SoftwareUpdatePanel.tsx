import { useEffect, useState } from 'react';
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

export function describeUpdateState(state: DesktopUpdateState) {
  if (state.phase === 'checking') return '正在获取最新版本信息…';
  if (state.phase === 'available') return `发现新版本 v${state.latestVersion}`;
  if (state.phase === 'downloading') return `正在下载 v${state.latestVersion ?? ''}`.trim();
  if (state.phase === 'downloaded') return `v${state.latestVersion} 已下载，等待安装`;
  if (state.phase === 'up-to-date') return '当前已是最新版本';
  if (state.phase === 'error') return '更新操作失败';
  return '尚未检查最新版本';
}

export function SoftwareUpdatePanel() {
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
        if (!disposed) setActionError(error instanceof Error ? error.message : '读取更新状态失败');
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
      setActionError(error instanceof Error ? error.message : '更新操作失败');
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
    <div className="space-y-5 p-6">
      <section
        className="rounded-xl border p-5"
        style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">版本与更新</h3>
            <p className="mt-1 text-xs" style={{ color: '#96836F' }}>
              手动检查最新版本、阅读更新日志，并在下载时查看实时进度。自动更新默认关闭。
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
            {loaded ? describeUpdateState(state) : '读取更新状态中…'}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(242,193,78,0.12)', background: '#141210' }}>
            <p className="text-xs" style={{ color: '#96836F' }}>当前版本</p>
            <p className="mt-1 text-xl font-semibold" style={{ color: '#EEE4CE' }}>v{state.currentVersion || APP_VERSION}</p>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(242,193,78,0.12)', background: '#141210' }}>
            <p className="text-xs" style={{ color: '#96836F' }}>线上最新版本</p>
            <p className="mt-1 text-xl font-semibold" style={{ color: '#F2C14E' }}>
              {state.latestVersion ? `v${state.latestVersion}` : '待检查'}
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
              <span className="block text-sm font-medium">自动检查并在后台下载更新</span>
              <span className="mt-1 block text-xs leading-5" style={{ color: '#96836F' }}>
                默认关闭。开启后每 4 小时检查一次；下载完成仍会询问是否立即重启安装。
              </span>
            </span>
          </label>
        ) : (
          <div className="mt-4 rounded-lg border px-4 py-3 text-xs leading-5" style={{ borderColor: 'rgba(217,123,58,0.22)', color: '#D9A06E', background: 'rgba(217,123,58,0.07)' }}>
            应用内更新仅在正式安装的桌面版中可用。当前运行模式可前往 Releases 手动查看和下载安装包。
          </div>
        )}

        {progress && state.phase === 'downloading' && (
          <div className="mt-4" aria-live="polite">
            <div className="mb-2 flex items-center justify-between text-xs" style={{ color: '#B8A58D' }}>
              <span>已下载 {formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
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
            手动检查更新
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
              下载更新
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
              立即重启并安装
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
            打开 Releases
          </a>
        </div>

        <p className="mt-4 text-xs leading-5" style={{ color: '#96836F' }}>
          Windows 安装包目前未签名，安装或更新时可能出现 SmartScreen“未知发布者”提示。
        </p>
      </section>

      {(state.releaseName || state.releaseNotes) && (
        <section className="rounded-xl border p-5" style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}>
          <h3 className="font-semibold">{state.releaseName || `v${state.latestVersion} 更新日志`}</h3>
          <div
            className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border p-4 text-sm leading-6"
            style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.1)', color: '#B8A58D' }}
          >
            {state.releaseNotes || '该版本暂未提供更新日志。'}
          </div>
        </section>
      )}
    </div>
  );
}
