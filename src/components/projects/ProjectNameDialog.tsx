import { FormEvent, useEffect, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';

import {
  getProjectNameSubmissionValue,
  shouldCloseDialogForKey,
} from './projectDialogLogic';

export type ProjectNameDialogProps = {
  title: string;
  initialValue: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

export function ProjectNameDialog({
  title,
  initialValue,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ProjectNameDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseDialogForKey(event.key)) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(getProjectNameSubmissionValue(value));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border p-5 shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.24)', color: '#EEE4CE' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <FolderPlus size={18} style={{ color: '#F2C14E' }} />
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
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.2)', color: '#EEE4CE' }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm" style={{ color: '#96836F' }}>
            {cancelLabel}
          </button>
          <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: '#F2C14E', color: '#16130F' }}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
