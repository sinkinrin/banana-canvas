import { ArrowLeft, FolderX } from 'lucide-react';
import { useAppTranslation } from '../../i18n';

export type MissingProjectStateProps = {
  onBack: () => void;
};

export function MissingProjectState({ onBack }: MissingProjectStateProps) {
  const { t } = useAppTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center px-6" style={{ background: '#16130F' }}>
      <section
        className="w-full max-w-md rounded-lg border p-8 text-center"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.2)', color: '#EEE4CE' }}
      >
        <FolderX size={44} className="mx-auto" style={{ color: '#F2C14E' }} />
        <h1 className="mt-4 text-xl font-semibold">{t('projects.missingTitle')}</h1>
        <p className="mt-2 text-sm leading-6" style={{ color: '#96836F' }}>
          {t('projects.missingDescription')}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: '#F2C14E', color: '#16130F' }}
        >
          <ArrowLeft size={16} />
          {t('projects.backToList')}
        </button>
      </section>
    </main>
  );
}
