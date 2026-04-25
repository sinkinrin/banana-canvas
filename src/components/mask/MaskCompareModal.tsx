import { createPortal } from 'react-dom';
import { Edit3, ImagePlus, X } from 'lucide-react';

type MaskCompareModalProps = {
  originalImageUrl: string;
  generatedImageUrl: string;
  prompt?: string;
  onClose: () => void;
  onContinueEdit: () => void;
  onUseAsReference: () => void;
};

export function MaskCompareModal({
  originalImageUrl,
  generatedImageUrl,
  prompt,
  onClose,
  onContinueEdit,
  onUseAsReference,
}: MaskCompareModalProps) {
  const content = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#16130F]/95 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <section
        className="w-full max-w-6xl rounded-3xl border p-5 shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.22)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#EEE4CE' }}>局部编辑对比</h2>
            {prompt && (
              <p className="mt-1 max-w-3xl text-sm" style={{ color: '#96836F' }}>{prompt}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-red-300 transition-colors hover:bg-red-900/30"
            title="关闭"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <figure className="rounded-2xl border p-3" style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.14)' }}>
            <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#F2C14E' }}>
              原图
            </figcaption>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl" style={{ background: '#0F0D0A' }}>
              <img src={originalImageUrl} alt="原图" className="max-h-full max-w-full object-contain" />
            </div>
          </figure>
          <figure className="rounded-2xl border p-3" style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.24)' }}>
            <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#F2C14E' }}>
              新图
            </figcaption>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl" style={{ background: '#0F0D0A' }}>
              <img src={generatedImageUrl} alt="新图" className="max-h-full max-w-full object-contain" />
            </div>
          </figure>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onUseAsReference}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"
            style={{ borderColor: 'rgba(242,193,78,0.2)', color: '#EEE4CE' }}
          >
            <ImagePlus size={16} />
            以新图为参考
          </button>
          <button
            type="button"
            onClick={onContinueEdit}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            <Edit3 size={16} />
            继续编辑新图
          </button>
        </div>
      </section>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
