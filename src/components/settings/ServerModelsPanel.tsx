import { useEffect, useRef, useState } from 'react';
import { useAppTranslation } from '../../i18n';

type ServerModel = { id: string; ownedBy?: string };

export function ServerModelsPanel({ connection }: { connection: string }) {
  const { t } = useAppTranslation();
  const [models, setModels] = useState<ServerModel[]>();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setModels(undefined); setError(''); setLoading(false);
    return () => request.current?.abort();
  }, [connection]);
  const load = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/runtime-settings/models', { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.upstreamStatus
        ? t('modelCatalog.httpError', { status: data.upstreamStatus }) : t(`modelCatalog.${data.code ?? 'MODEL_LIST_UNAVAILABLE'}`));
      if (!controller.signal.aborted) setModels(data.models);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : t('modelCatalog.MODEL_LIST_UNAVAILABLE'));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const filtered = models?.filter(model => `${model.id} ${model.ownedBy ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="mt-4 space-y-3 rounded-lg border border-[#F2C14E]/15 p-3" data-server-models="true">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-sm font-medium">{t('modelCatalog.title')}</h4>
      <button type="button" disabled={loading || !connection} onClick={() => void load()} className="rounded-lg bg-[#F2C14E] px-3 py-1.5 text-xs text-[#16130F] disabled:opacity-40">
        {loading ? t('common.loading') : t(models ? 'modelCatalog.refresh' : 'modelCatalog.load')}
      </button>
    </div>
    <p className="text-xs text-[#96836F]">{t('modelCatalog.hint')}</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {models && <>
      <input aria-label={t('modelCatalog.search')} placeholder={t('modelCatalog.search')} value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded border border-[#F2C14E]/20 bg-[#141210] p-2 text-xs" />
      <p className="text-xs text-[#96836F]">{t('modelCatalog.count', { count: models.length })}</p>
      <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
        {filtered?.map(model => <li key={model.id} className="flex justify-between gap-3 rounded bg-[#141210] p-2"><span className="break-all select-text">{model.id}</span><span className="shrink-0 text-[#96836F]">{model.ownedBy}</span></li>)}
      </ul>
      {!filtered?.length && <p className="text-xs text-[#96836F]">{t('modelCatalog.empty')}</p>}
    </>}
  </section>;
}
