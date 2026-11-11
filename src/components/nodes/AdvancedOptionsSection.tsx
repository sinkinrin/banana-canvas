import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAppTranslation } from '../../i18n';

export function AdvancedOptionsSection({ kind, summary, children }: {
  kind: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const { t } = useAppTranslation();
  return (
    <details data-advanced-options={kind} className="group/options border-t border-[#F2C14E]/15">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-xs text-[#D6C8B2] [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="shrink-0 transition-transform group-open/options:rotate-90" />
        <span className="shrink-0">{t('promptNode.moreSettings')}</span>
        <span className="ml-auto min-w-0 text-right text-[11px] text-[#C6B38F]">{summary}</span>
      </summary>
      <div data-options-body={kind} className="nowheel max-h-80 space-y-4 overflow-y-auto overscroll-contain px-1 pb-3">
        {children}
      </div>
    </details>
  );
}
