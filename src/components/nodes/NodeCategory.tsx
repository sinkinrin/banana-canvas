import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Tags, X } from 'lucide-react';
import { useStore } from '../../store';
import { useAppTranslation } from '../../i18n';
import { CATEGORY_COLORS, assignNodeCategory, getNodeCategories, renameNodeCategory } from '../../lib/nodeCategories';

export function NodeCategory({ nodeId }: { nodeId: string }) {
  const { t } = useAppTranslation();
  const data = useStore(state => state.nodes.find(node => node.id === nodeId)?.data);
  const [open, setOpen] = useState(false);
  const label = data?.color ? data.categoryName || (CATEGORY_COLORS.includes(data.color) ? t('categories.color', { index: CATEGORY_COLORS.indexOf(data.color) + 1 }) : data.color) : t('categories.unassigned');
  return <>
    <button type="button" data-node-category={nodeId} title={t('categories.assign')} aria-label={`${t('categories.assign')}: ${label}`}
      className="nodrag nopan nowheel flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#B8A58D]"
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onClick={() => setOpen(true)}>
      <Tags size={14} style={{ color: data?.color || '#96836F' }} /><span className="max-w-32 truncate">{label}</span>
    </button>
    {open && <CategoryDialog nodeId={nodeId} onClose={() => setOpen(false)} />}
  </>;
}

function CategoryDialog({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const { t } = useAppTranslation();
  const nodes = useStore(state => state.nodes);
  const data = nodes.find(node => node.id === nodeId)?.data;
  const categories = getNodeCategories(nodes);
  return createPortal(<div className="nodrag nopan nowheel fixed inset-0 z-[10010] flex items-center justify-center bg-black/70 p-4"
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onClick={onClose} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={t('categories.assign')} className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl border border-[#F2C14E]/25 bg-[#1D1A14] p-4 text-[#EEE4CE]" onClick={event => event.stopPropagation()}>
        <header className="mb-3 flex shrink-0 items-center justify-between"><h2>{t('categories.assign')}</h2><button autoFocus type="button" aria-label={t('common.close')} onClick={onClose}><X size={18} /></button></header>
        <p className="mb-3 text-xs text-[#B8A58D]">{t('categories.hint')}</p>
        <div className="min-h-0 space-y-2 overflow-y-auto">
          <button type="button" className="w-full rounded-lg border border-[#F2C14E]/20 p-2 text-left text-sm" onClick={() => { useStore.setState(state => ({ nodes: assignNodeCategory(state.nodes, nodeId, '') })); onClose(); }}>{t('categories.unassigned')}</button>
          {categories.map((category, index) => <div key={category.color} className="flex items-center gap-2">
            <button type="button" data-assign-category={category.color} aria-label={category.name || t('categories.color', { index: index + 1 })} aria-pressed={data?.color === category.color}
              className="h-8 w-8 shrink-0 rounded-full border-2" style={{ background: category.color, borderColor: data?.color === category.color ? '#EEE4CE' : 'transparent' }}
              onClick={() => useStore.setState(state => ({ nodes: assignNodeCategory(state.nodes, nodeId, category.color) }))} />
            <input key={`${category.color}-${category.name}`} aria-label={t('categories.name')} placeholder={t('categories.color', { index: index + 1 })} defaultValue={category.name} maxLength={32} disabled={!category.ids.length}
              className="min-w-0 flex-1 rounded-lg bg-[#141210] p-2 text-sm disabled:opacity-50"
              onBlur={event => { const name = event.target.value; useStore.setState(state => ({ nodes: renameNodeCategory(state.nodes, category.color, name) })); }}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
            <span className="text-xs text-[#96836F]">{category.ids.length}</span>
          </div>)}
        </div>
      </section>
    </div>, document.body);
}
