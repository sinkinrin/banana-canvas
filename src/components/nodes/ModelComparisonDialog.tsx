import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { useAppTranslation } from '../../i18n';
import { IMAGE_MODELS, getImageModelConfig, type ImageModelId, type BananaAspectRatio, type BananaImageSize } from '../../lib/imageModels';
import { getComparisonOptions, markComparisonWinner } from '../../lib/modelComparison';
import { resolveImageUrl } from '../../lib/canvasState';
import { CHECKERBOARD_STYLE } from '../../lib/cutoutModels';
import { GenerationInfoCard } from './GenerationInfoCard';

function ComparisonFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { t } = useAppTranslation();
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  const content = <div className="nodrag nopan nowheel fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4" onPointerDown={event => event.stopPropagation()} onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label={t('comparison.title')} data-model-comparison="true" className="flex max-h-[90vh] w-full max-w-7xl flex-col rounded-2xl border border-[#F2C14E]/25 bg-[#1D1A14] p-5 text-[#EEE4CE]" onClick={event => event.stopPropagation()}>
      <header className="mb-4 flex shrink-0 justify-between gap-3"><h2 className="font-semibold">{t('comparison.title')}</h2><button type="button" aria-label={t('common.close')} onClick={onClose}>✕</button></header>
      <div className="min-h-0 overflow-auto">{children}</div>
    </section>
  </div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

export type ComparisonSelection = { models: ImageModelId[]; aspectRatio: BananaAspectRatio; imageSize: BananaImageSize };

export function ModelComparisonSetup({ onClose, onStart }: { onClose: () => void; onStart: (value: ComparisonSelection) => void }) {
  const { t } = useAppTranslation();
  const [models, setModels] = useState<ImageModelId[]>(['image2.5-flare', 'image2.5-sunburst']);
  const [ratio, setRatio] = useState<BananaAspectRatio>('1:1');
  const [size, setSize] = useState<BananaImageSize>('1K');
  const options = getComparisonOptions(models);
  const imageSize = options.sizes.includes(size) ? size : '1K';
  const aspectRatio = options.ratios.includes(ratio) ? ratio : '1:1';
  return <ComparisonFrame onClose={onClose}>
    <p className="mb-4 text-sm text-[#B8A58D]">{t('comparison.description')}</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{IMAGE_MODELS.map(model => <label key={model.id} className="flex items-start gap-3 rounded-lg border border-[#F2C14E]/20 p-3"><input type="checkbox" checked={models.includes(model.id)} onChange={event => setModels(current => event.target.checked ? [...current, model.id] : current.filter(id => id !== model.id))} /><span><span className="block text-sm">{model.label}</span><span className="text-xs text-[#96836F]">{t(model.descriptionKey)}</span></span></label>)}</div>
    <div className="my-4 flex flex-wrap gap-4 text-sm">
      <label>{t('promptNode.aspectRatio')} <select className="rounded bg-[#141210] p-2" value={aspectRatio} onChange={event => setRatio(event.target.value as BananaAspectRatio)}>{options.ratios.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('promptNode.resolution')} <select className="rounded bg-[#141210] p-2" value={imageSize} onChange={event => setSize(event.target.value as BananaImageSize)}>{options.sizes.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <p className="mb-4 text-xs text-[#B8A58D]">{t('comparison.count', { count: models.length })}</p>
    <button type="button" disabled={models.length < 2} className="rounded-lg bg-[#F2C14E] px-4 py-2 text-sm font-semibold text-[#16130F] disabled:opacity-40" onClick={() => onStart({ models, aspectRatio, imageSize })}>{t('comparison.start')}</button>
  </ComparisonFrame>;
}

export function ModelComparisonResults({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { t } = useAppTranslation();
  const nodes = useStore(useShallow(state => state.nodes.filter(node => node.data.comparisonGroupId === groupId)));
  const assets = useStore(state => state.assets);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  return <ComparisonFrame onClose={onClose}>
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2">{t('comparison.zoom')}<input type="range" min="1" max="4" step="0.1" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label><span>{zoom.toFixed(1)}×</span><button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{t('comparison.reset')}</button></div>
    <p className="mb-4 text-xs text-[#96836F]">{t('comparison.resultsHint')}</p>
    <div className="flex gap-4 overflow-x-auto pb-3">{nodes.map(node => {
      const url = resolveImageUrl(node.data, assets);
      return <article key={node.id} className="w-[340px] min-w-[280px] flex-1 space-y-3 rounded-xl border border-[#F2C14E]/20 p-3">
        <h3 className="text-sm font-semibold">{getImageModelConfig(node.data.imageModel).label}</h3>
        <div className="relative flex aspect-square touch-none items-center justify-center overflow-hidden rounded-lg" style={CHECKERBOARD_STYLE}
          onPointerDown={event => { if (!url) return; drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { if (!drag.current) return; const rect = event.currentTarget.getBoundingClientRect(); setPan({ x: Math.max(-100, Math.min(100, drag.current.panX + (event.clientX - drag.current.x) / rect.width * 100)), y: Math.max(-100, Math.min(100, drag.current.panY + (event.clientY - drag.current.y) / rect.height * 100)) }); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {url ? <img src={url} alt={getImageModelConfig(node.data.imageModel).label} draggable={false} className="h-full w-full object-contain" style={{ transform: `translate(${pan.x}%, ${pan.y}%) scale(${zoom})` }} /> : <p className="rounded bg-[#141210]/90 p-3 text-xs">{node.data.error || t(node.data.isLoading ? 'common.loading' : 'comparison.interrupted')}</p>}
        </div>
        {url && <GenerationInfoCard imageUrl={url} info={node.data.generationInfo} />}
        <button type="button" disabled={!url || node.data.isLoading} aria-pressed={!!node.data.comparisonWinner} className="rounded-lg border border-[#F2C14E]/25 px-3 py-2 text-xs text-[#F2C14E] disabled:opacity-40" onClick={() => useStore.setState(state => ({ nodes: markComparisonWinner(state.nodes, node.id) }))}>{t(node.data.comparisonWinner ? 'comparison.winner' : 'comparison.markBest')}</button>
      </article>;
    })}</div>
    {!nodes.length && <p className="text-sm text-[#96836F]">{t('comparison.empty')}</p>}
  </ComparisonFrame>;
}
