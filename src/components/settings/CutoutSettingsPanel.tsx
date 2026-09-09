import { useEffect, useState } from 'react';
import { Check, Download, Loader2, Scissors, Trash2 } from 'lucide-react';
import { useAppTranslation } from '../../i18n';
import { CUTOUT_MODELS, getCutoutBridge, type CutoutState } from '../../lib/cutoutModels';
import { cutoutErrorMessage } from '../../services/cutout';

export function CutoutSettingsPanel() {
  const { t } = useAppTranslation();
  const bridge = getCutoutBridge();
  const [state, setState] = useState<CutoutState>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let disposed = false;
    const update = (value: CutoutState) => { if (!disposed) setState(value); };
    const unsubscribe = bridge.subscribe(update);
    bridge.getState().then(update).catch((failure) => { if (!disposed) setError(cutoutErrorMessage(failure)); });
    return () => { disposed = true; unsubscribe(); };
  }, [bridge]);
  async function action(run: () => Promise<unknown>) {
    setPending(true); setError(undefined);
    try { await run(); if (bridge) setState(await bridge.getState()); }
    catch (failure) { setError(cutoutErrorMessage(failure)); }
    finally { setPending(false); }
  }
  return <div data-cutout-settings="true" className="space-y-5 p-6">
    <div className="flex gap-3"><Scissors size={22} className="mt-1 shrink-0 text-[#F2C14E]" /><div>
      <h3 className="font-semibold">{t('cutout.settingsTitle')}</h3>
      <p className="mt-1 text-xs leading-5 text-[#96836F]">{t('cutout.settingsDescription')}</p>
    </div></div>
    {!bridge ? <p className="text-sm text-[#B8A58D]">{t('cutout.errors.DESKTOP_ONLY')}</p> : !state && !error ? <Loader2 className="animate-spin" size={20} /> : state && CUTOUT_MODELS.map((model) => {
      const installed = state.installed.includes(model.id);
      const selected = state.selectedModelId === model.id;
      const progress = state.download?.modelId === model.id ? state.download : undefined;
      const percent = progress ? Math.floor(progress.received / progress.total * 100) : 0;
      return <section key={model.id} data-cutout-model={model.id} className="rounded-xl border p-4" style={{ background: '#18150F', borderColor: selected ? 'rgba(242,193,78,0.45)' : 'rgba(242,193,78,0.14)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2 text-sm font-semibold">{model.name}
            {model.bundled && <span className="rounded bg-[#F2C14E]/10 px-2 py-0.5 text-xs text-[#F2C14E]">{t('cutout.bundled')}</span>}
          </div><p className="mt-1 text-xs text-[#96836F]">{(model.bytes / 1e6).toFixed(1)} MB · {t(`cutout.models.${model.id}`)}</p></div>
          <div className="flex items-center gap-2">
            {selected && installed ? <span className="flex items-center gap-1 text-xs text-[#7CCB8A]"><Check size={14} />{t('cutout.active')}</span> : installed ?
              <button type="button" data-cutout-select={model.id} disabled={pending} onClick={() => void action(() => bridge.select(model.id))} className="rounded-lg bg-[#F2C14E] px-3 py-2 text-xs text-[#16130F] disabled:opacity-40">{t('cutout.use')}</button> : !progress && !model.bundled ?
              <button type="button" data-cutout-download={model.id} disabled={pending || Boolean(state.download)} onClick={() => void action(() => bridge.download(model.id))} className="flex items-center gap-1 rounded-lg bg-[#F2C14E]/10 px-3 py-2 text-xs text-[#F2C14E] disabled:opacity-40"><Download size={14} />{t('common.download')}</button> : null}
            {installed && !model.bundled && <button type="button" disabled={pending || state.busy} onClick={() => void action(() => bridge.remove(model.id))} title={t('cutout.remove')} className="rounded-lg p-2 text-[#96836F] hover:text-red-400 disabled:opacity-40"><Trash2 size={15} /></button>}
          </div>
        </div>
        {progress && <div className="mt-4"><div className="mb-2 flex justify-between text-xs text-[#B8A58D]"><span>{t('cutout.downloading', { percent })} · {(progress.received / 1e6).toFixed(1)} / {(progress.total / 1e6).toFixed(1)} MB</span><button type="button" onClick={() => void bridge.cancelDownload()}>{t('common.cancel')}</button></div><progress className="h-1.5 w-full accent-[#F2C14E]" max={progress.total} value={progress.received} /></div>}
        {model.bundled && !installed && <p className="mt-2 text-xs text-red-400">{t('cutout.errors.MODEL_MISSING')}</p>}
      </section>;
    })}
    {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    <p className="text-xs leading-5 text-[#96836F]">{t('cutout.settingsHint')}</p>
  </div>;
}
