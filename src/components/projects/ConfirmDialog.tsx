import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

import { shouldCloseDialogForKey } from './projectDialogLogic';

export type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseDialogForKey(event.key)) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <section
        className="w-full max-w-sm rounded-lg border p-5 shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(217,123,58,0.34)', color: '#EEE4CE' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle size={18} style={{ color: '#D97B3A' }} />
            {title}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1"
            style={{ color: '#96836F' }}
            aria-label={cancelLabel}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6" style={{ color: '#BCA88E' }}>{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm" style={{ color: '#96836F' }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: '#D97B3A', color: '#16130F' }}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
