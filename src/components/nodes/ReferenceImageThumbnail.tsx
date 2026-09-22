import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Maximize2, X } from 'lucide-react';
import { useAppTranslation } from '../../i18n';
import { copyImageToClipboard } from '../../lib/clipboard';
import type { InlineImageData } from '../../lib/canvasState';

export function ReferenceImageThumbnail({ image, index, badge, isSketch, onOpen, onRemove }: {
  image: InlineImageData;
  index: number;
  badge: string;
  isSketch: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useAppTranslation();
  const [copyStatus, setCopyStatus] = useState<'copied' | 'error' | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(feedbackTimer.current), []);

  const copy = async () => {
    clearTimeout(feedbackTimer.current);
    setCopyStatus(null);
    try {
      await copyImageToClipboard(image.url);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
    feedbackTimer.current = setTimeout(() => setCopyStatus(null), 2500);
  };

  return (
    <div data-reference-image={index} className="relative aspect-square w-full overflow-hidden rounded-lg"
      style={{ background: '#141210', border: '1px solid rgba(242,193,78,0.15)' }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); void copy(); }}>
      <button type="button" data-reference-action="preview" onClick={onOpen}
        title={t('promptNode.previewReference')} aria-label={t('promptNode.previewReference')}
        className="h-full w-full cursor-zoom-in">
        <img src={image.url} alt={t('promptNode.referenceAlt', { index: index + 1 })} className="h-full w-full object-cover opacity-80" draggable={false} />
        <span className="absolute left-1 top-1 rounded-full bg-[#F2C14E] p-1 text-[#16130F] shadow"><Maximize2 size={12} /></span>
      </button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }}
        className="absolute right-1 top-1 z-20 rounded-full bg-red-500 p-0.5 text-white shadow transition-colors hover:bg-red-600"
        title={t('promptNode.removeReference')} aria-label={t('promptNode.removeReference')}><X size={10} /></button>
      <div className="pointer-events-none absolute bottom-1 left-1 rounded px-1 py-0.5" style={{ background: 'rgba(22,19,15,0.8)', color: '#F2C14E', fontSize: '10px', fontWeight: 500 }}>
        <span data-reference-kind={isSketch ? 'sketch' : undefined}>{badge}</span>
      </div>
      {copyStatus && <div role="status" className="pointer-events-none absolute inset-x-1 bottom-6 flex items-center justify-center gap-1 rounded bg-black/85 px-1 py-1 text-[10px] text-white">
        {copyStatus === 'copied' ? <Check size={12} /> : <CircleAlert size={12} />}
        {copyStatus === 'copied' ? t('imageNode.imageCopied') : t('common.copyFailedRetry')}
      </div>}
    </div>
  );
}
