import { createPortal } from 'react-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useAppTranslation } from '../../i18n';
import { IMAGE_MODELS, type ImageModelId, type BananaAspectRatio, type BananaImageSize } from '../../lib/imageModels';
import { getComparisonOptions, getDesktopComparisonBridge, normalizeComparisonSelection, readComparisonSelection, saveComparisonSelection, type ComparisonSelection } from '../../lib/modelComparison';

function ComparisonFrame({ onClose, children, compact = false, footer }: { onClose: () => void; children: ReactNode; compact?: boolean; footer?: ReactNode }) {
  const { t } = useAppTranslation();
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  const content = <div className="nodrag nopan nowheel fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4" onPointerDown={event => event.stopPropagation()} onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label={t('comparison.title')} data-model-comparison="true" className={`flex max-h-[90vh] w-full ${compact ? 'max-w-4xl' : 'max-w-7xl'} flex-col rounded-2xl border border-[#F2C14E]/25 bg-[#1D1A14] p-5 text-[#EEE4CE]`} onClick={event => event.stopPropagation()}>
      <header className="mb-4 flex shrink-0 justify-between gap-3"><h2 className="font-semibold">{t('comparison.title')}</h2><button type="button" aria-label={t('common.close')} onClick={onClose}>✕</button></header>
      <div className="min-h-0 overflow-auto">{children}</div>
      {footer && <footer className="mt-4 shrink-0 border-t border-[#F2C14E]/15 pt-3">{footer}</footer>}
    </section>
  </div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

export type { ComparisonSelection } from '../../lib/modelComparison';

export function ModelComparisonSetup({ onClose, onStart, defaults }: { onClose: () => void; onStart: (value: ComparisonSelection) => void; defaults?: Partial<ComparisonSelection> }) {
  const { t } = useAppTranslation();
  const [initial, setInitial] = useState<ComparisonSelection | undefined>(() => getDesktopComparisonBridge() ? undefined : readComparisonSelection(defaults));
  useEffect(() => {
    let active = true;
    const bridge = getDesktopComparisonBridge();
    if (bridge) void bridge.get().then(value => {
      if (active) setInitial(normalizeComparisonSelection(value, defaults));
    }).catch(() => { if (active) setInitial(readComparisonSelection(defaults)); });
    return () => { active = false; };
  }, []);
  return initial ? <ComparisonForm initial={initial} onClose={onClose} onStart={onStart} /> : <ComparisonFrame onClose={onClose} compact><p>{t('common.loading')}</p></ComparisonFrame>;
}

function ComparisonForm({ initial, onClose, onStart }: { initial: ComparisonSelection; onClose: () => void; onStart: (value: ComparisonSelection) => void }) {
  const { t } = useAppTranslation();
  const [starting, setStarting] = useState(false);
  const [models, setModels] = useState<ImageModelId[]>(initial.models);
  const [ratio, setRatio] = useState<BananaAspectRatio>(initial.aspectRatio);
  const [size, setSize] = useState<BananaImageSize>(initial.imageSize);
  const options = getComparisonOptions(models);
  const imageSize = options.sizes.includes(size) ? size : '1K';
  const aspectRatio = options.ratios.includes(ratio) ? ratio : '1:1';
  return <ComparisonFrame onClose={onClose} compact footer={<>
    <p className="mb-3 text-xs text-[#B8A58D]">{t('comparison.count', { count: models.length })}</p>
    <button type="button" disabled={starting || models.length < 2} className="rounded-lg bg-[#F2C14E] px-4 py-2 text-sm font-semibold text-[#16130F] disabled:opacity-40" onClick={async () => {
      setStarting(true);
      const selection = { models, aspectRatio, imageSize };
      try { await saveComparisonSelection(selection); } catch { /* Generation can proceed if preference storage is unavailable. */ }
      onStart(selection);
    }}>{t('comparison.start')}</button>
  </>}>
    <p className="mb-4 text-sm text-[#B8A58D]">{t('comparison.description')}</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{IMAGE_MODELS.map(model => <label key={model.id} className="flex items-start gap-3 rounded-lg border border-[#F2C14E]/20 p-3"><input type="checkbox" checked={models.includes(model.id)} onChange={event => setModels(current => event.target.checked ? [...current, model.id] : current.filter(id => id !== model.id))} /><span><span className="block text-sm">{model.label}</span><span className="text-xs text-[#96836F]">{t(model.descriptionKey)}</span></span></label>)}</div>
    <div className="my-4 flex flex-wrap gap-4 text-sm">
      <label>{t('promptNode.aspectRatio')} <select className="rounded bg-[#141210] p-2" value={aspectRatio} onChange={event => setRatio(event.target.value as BananaAspectRatio)}>{options.ratios.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('promptNode.resolution')} <select className="rounded bg-[#141210] p-2" value={imageSize} onChange={event => setSize(event.target.value as BananaImageSize)}>{options.sizes.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
  </ComparisonFrame>;
}
