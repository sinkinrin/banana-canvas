import { useId } from 'react';
import { useAppTranslation } from '../../i18n';

type ParameterTipsTooltipProps = { tips: string[] };

export function ParameterTipsTooltip({ tips }: ParameterTipsTooltipProps) {
  const { t } = useAppTranslation();
  const id = useId();
  return <>
    <button type="button" aria-label={t('common.parameterHelp')} title={t('common.parameterHelp')}
      popoverTarget={id}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#F2C14E]/25 bg-[#F2C14E]/10 text-xs text-[#F2C14E] hover:bg-[#F2C14E]/20">?</button>
    <div id={id} popover="auto" role="dialog" aria-label={t('common.parameterHelp')}
      className="nodrag nopan nowheel fixed inset-0 m-auto max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[#F2C14E]/20 bg-[#141210] p-4 text-[#EEE4CE] shadow-2xl"
      onPointerDown={event => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{t('common.parameterHelp')}</span>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={t('common.close')}
          className="rounded px-2 py-1 text-sm hover:bg-[#F2C14E]/10">×</button>
      </div>
      <div className="space-y-2 text-xs leading-relaxed text-[#B8A58D]">
        {tips.map(tip => <p key={tip}>{tip}</p>)}
      </div>
    </div>
  </>;
}
