import { Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type GeneratingImagePlaceholderProps = {
  modelLabel: string;
  title: string;
  prompt?: string;
  createdAt?: string;
  error?: string;
};

function formatGenerationTime(createdAt?: string) {
  if (!createdAt) return '';

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatElapsedTime(createdAt: string | undefined, nowMs: number) {
  if (!createdAt) return '';

  const startMs = new Date(createdAt).getTime();
  if (Number.isNaN(startMs)) return '';

  const totalSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function getAvatarText(modelLabel: string) {
  if (modelLabel.toLowerCase() === 'image2') {
    return (
      <>
        image<br />2
      </>
    );
  }

  return modelLabel.slice(0, 6);
}

export function GeneratingImagePlaceholder({
  modelLabel,
  title,
  prompt,
  createdAt,
  error,
}: GeneratingImagePlaceholderProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timeLabel = formatGenerationTime(createdAt);
  const elapsedLabel = formatElapsedTime(createdAt, nowMs);
  const statusLabel = error ? '生成失败' : '生成中';

  useEffect(() => {
    if (error || !createdAt) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [createdAt, error]);

  return (
    <div
      className="w-[350px] overflow-hidden rounded-2xl border p-4 shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
      style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.18)', color: '#EEE4CE' }}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-center text-xs font-bold leading-[0.95] text-[#16130F] shadow-[0_8px_28px_rgba(242,193,78,0.22)]" style={{ background: 'linear-gradient(135deg,#F2C14E 0%,#D97B3A 100%)' }}>
          <span className="absolute inset-0 rounded-2xl opacity-0 animate-ping" style={{ background: 'rgba(255,255,255,0.24)' }} />
          <span className="relative">
          {getAvatarText(modelLabel)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black leading-tight" title={title}>
            {title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: '#96836F' }}>
            {timeLabel && <span>{timeLabel}</span>}
            {elapsedLabel && <span className="rounded-full px-2 py-0.5" style={{ background: 'rgba(242,193,78,0.08)', color: '#F2C14E' }}>已耗时 {elapsedLabel}</span>}
          </div>
        </div>
      </div>

      <div
        className="relative flex h-[350px] w-full items-center justify-center overflow-hidden rounded-xl border"
        aria-label={statusLabel}
        style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.12)' }}
      >
        <div className="absolute inset-0 opacity-70" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(242,193,78,0.18), transparent 34%), linear-gradient(135deg, rgba(242,193,78,0.05), rgba(217,123,58,0.03))' }} />
        <div className="absolute h-56 w-56 animate-spin rounded-full opacity-70 [animation-duration:3.5s]" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(242,193,78,0.55), transparent 42%)' }} />
        <div className="absolute h-44 w-44 rounded-full" style={{ background: '#141210' }} />
        <div className="absolute inset-x-8 top-16 h-px animate-pulse" style={{ background: 'linear-gradient(90deg, transparent, rgba(242,193,78,0.65), transparent)' }} />
        <div className="relative flex h-24 w-28 items-center justify-center rounded-2xl border text-[#F2C14E] shadow-[0_0_36px_rgba(242,193,78,0.18)]" style={{ background: 'rgba(29,26,20,0.82)', borderColor: 'rgba(242,193,78,0.28)' }}>
          <ImageIcon size={48} strokeWidth={1.6} />
        </div>
        {!error && (
          <div className="absolute bottom-6 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium" style={{ background: 'rgba(29,26,20,0.82)', color: '#F2C14E', border: '1px solid rgba(242,193,78,0.16)' }}>
            <span>正在绘制</span>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#F2C14E]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#F2C14E] [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#F2C14E] [animation-delay:240ms]" />
          </div>
        )}
      </div>

      {prompt && (
        <div className="mt-3 line-clamp-2 text-xs leading-relaxed" style={{ color: '#96836F' }} title={prompt}>
          {prompt}
        </div>
      )}

      <div className="mt-5 flex items-center justify-center gap-2" aria-label={statusLabel}>
        {error ? (
          <span className="max-w-full truncate rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }} title={error}>
            {error}
          </span>
        ) : (
          <>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'rgba(242,193,78,0.35)' }} />
            <span className="h-3.5 w-3.5 animate-bounce rounded-full bg-[#F2C14E] [animation-duration:0.9s]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full [animation-delay:0.2s]" style={{ background: 'rgba(242,193,78,0.35)' }} />
            <span className="sr-only">生成中</span>
          </>
        )}
      </div>
    </div>
  );
}
