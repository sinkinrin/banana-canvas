import { useEffect, useState } from 'react';
import { useAppTranslation } from '../../i18n';
import type { GenerationInfo } from '../../lib/generationInfo';

export function GenerationInfoCard({ imageUrl, info }: { imageUrl: string; info?: GenerationInfo }) {
  const { t } = useAppTranslation();
  const [size, setSize] = useState('');
  useEffect(() => {
    setSize('');
    const image = new Image();
    image.onload = () => setSize(`${image.naturalWidth} × ${image.naturalHeight}`);
    image.src = imageUrl;
    return () => { image.onload = null; image.onerror = null; };
  }, [imageUrl]);
  const unknown = t('generationInfo.unknown');
  const format = /^data:image\/([^;]+)/.exec(imageUrl)?.[1]?.toUpperCase();
  const rows = [
    [t('generationInfo.actualSize'), size || unknown],
    [t('generationInfo.format'), format || unknown],
    [t('generationInfo.elapsed'), info?.elapsedMs === undefined ? unknown : `${(info.elapsedMs / 1000).toFixed(1)} s`],
    [t('generationInfo.apiModel'), info?.apiModel || unknown],
    [t('generationInfo.reportedModel'), info?.reportedModel || unknown],
    [t('generationInfo.requestedSize'), info?.requestedSize || unknown],
    [t('generationInfo.quality'), `${info?.requestedQuality || unknown} → ${info?.reportedQuality || unknown}`],
  ];
  return <details className="nodrag nopan nowheel max-w-[512px] rounded-lg border border-[#F2C14E]/15 p-2 text-xs text-[#B8A58D]" data-generation-info="true" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <summary className="cursor-pointer text-[#D7BC7C]">{t('generationInfo.title')}{size ? ` · ${size}` : ''}{format ? ` · ${format}` : ''}</summary>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
      {rows.map(([label, value]) => <div key={label} className="contents"><dt>{label}</dt><dd className="break-all text-right select-text">{value}</dd></div>)}
    </dl>
    <p className="mt-2 text-[10px] text-[#96836F]">{t('generationInfo.hint')}</p>
  </details>;
}
