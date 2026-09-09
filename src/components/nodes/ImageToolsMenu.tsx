import { useEffect, useRef, useState } from 'react';
import { Edit3, Scissors } from 'lucide-react';
import { useAppTranslation } from '../../i18n';

export function ImageToolsMenu({ onCutout, onMaskEdit, cutoutDisabled, compact = false }: {
  onCutout: () => void; onMaskEdit: () => void; cutoutDisabled: boolean; compact?: boolean;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  return <div ref={root} className={`nodrag nopan nowheel ${compact ? 'absolute left-1 top-1 z-30' : 'relative'}`} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
    <button type="button" data-image-action="tools" title={t('cutout.tools')} aria-expanded={open} aria-haspopup="menu"
      onClick={(event) => { event.stopPropagation(); setOpen(!open); }}
      className={compact ? 'rounded-full bg-[#F2C14E] p-1 text-[#16130F] shadow' : 'rounded-xl p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)]'}>
      <Edit3 size={compact ? 12 : 18} />
    </button>
    {open && <div role="menu" className={`absolute ${compact ? 'left-0' : 'right-0'} top-full z-40 mt-1 min-w-36 rounded-xl border border-[#F2C14E]/20 bg-[#252117] p-1 shadow-xl`}>
      <button type="button" role="menuitem" data-image-action="cutout" disabled={cutoutDisabled}
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs text-[#EEE4CE] hover:bg-white/10 disabled:opacity-40"
        onClick={(event) => { event.stopPropagation(); setOpen(false); onCutout(); }}><Scissors size={14} />{t('cutout.title')}</button>
      <button type="button" role="menuitem" data-image-action="mask-edit"
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs text-[#EEE4CE] hover:bg-white/10"
        onClick={(event) => { event.stopPropagation(); setOpen(false); onMaskEdit(); }}><Edit3 size={14} />{t('imageNode.maskEdit')}</button>
    </div>}
  </div>;
}
