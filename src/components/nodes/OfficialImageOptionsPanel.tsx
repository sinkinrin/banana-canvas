import { useEffect, useState } from 'react';
import { useAppTranslation } from '../../i18n';
import { getOfficialImageCapabilities, SVG_REASONING_VALUES, validateOfficialImageOptions, type OfficialImageModelId, type OfficialImageOptions, type OfficialImageReference } from '../../lib/officialImages';
import { AdvancedOptionsSection } from './AdvancedOptionsSection';

type Props = { imageModel: OfficialImageModelId; value?: OfficialImageOptions; referenceCount: number; onChange: (value: OfficialImageOptions) => void };
const fieldClass = 'nowheel w-full min-w-0 rounded-lg border border-[#F2C14E]/20 bg-[#1D1A14] p-2 text-xs text-[#EEE4CE]';
function reference(value: string): OfficialImageReference | undefined {
  const text = value.trim();
  return !text ? undefined : text.startsWith('file-') ? { file_id: text } : { image_url: text };
}
export function OfficialImageOptionsPanel({ imageModel, value = {}, referenceCount, onChange }: Props) {
  const { t } = useAppTranslation();
  const serializedInputs = (value.imageInputs ?? []).map(item => item.file_id ?? item.image_url).join('\n');
  const [inputDraft, setInputDraft] = useState(serializedInputs);
  useEffect(() => setInputDraft(serializedInputs), [serializedInputs]);
  const capabilities = getOfficialImageCapabilities(imageModel);
  const format = value.outputFormat ?? 'png';
  const raster = !['svg', 'gif'].includes(format);
  const editing = referenceCount > 0 || Boolean(value.imageInputs?.length);
  const technicalConfigured = Boolean(value.imageInputs?.length || value.mask || value.markup || value.safetyIdentifier
    || (value.moderation && value.moderation !== 'auto') || value.stream !== undefined || value.partialImages !== undefined);
  const set = (patch: Partial<OfficialImageOptions>) => {
    const next = { ...value, ...patch };
    for (const key of Object.keys(next)) if (next[key as keyof OfficialImageOptions] === undefined) delete next[key as keyof OfficialImageOptions];
    onChange(next);
  };
  const setFormat = (next: OfficialImageOptions['outputFormat']) => {
    const options = { ...value, outputFormat: next };
    if (next !== 'gif') { delete options.frameCount; delete options.frameDurationMs; }
    if (next !== 'svg') { delete options.svgModel; delete options.svgReasoning; }
    if (next === 'svg') options.n = 1;
    if (next === 'svg' || next === 'gif') { delete options.stream; delete options.partialImages; }
    if (next !== 'jpeg' && next !== 'webp') delete options.outputCompression;
    if (next !== 'png' && next !== 'webp' && options.background === 'transparent') options.background = 'opaque';
    onChange(options);
  };
  const optionLabel = (choice: string) => ['png', 'jpeg', 'webp', 'svg', 'gif'].includes(choice)
    ? choice.toUpperCase() : choice ? t(`officialImages.optionValues.${choice}`) : t('officialImages.default');
  const select = (key: 'quality' | 'complexity' | 'background' | 'outputFormat' | 'moderation' | 'svgReasoning', choices: readonly string[], fallback: string) => (
    <label className="block min-w-0 space-y-1.5 text-xs text-[#B8A58D]">{t(`officialImages.${key}`)}
      <select className={fieldClass} name={`officialImage.${key}`} value={value[key] ?? fallback}
        onChange={event => key === 'outputFormat' ? setFormat(event.target.value as OfficialImageOptions['outputFormat'])
          : set({ [key]: event.target.value || undefined,
            ...(key === 'background' && event.target.value === 'transparent' && !['png', 'webp'].includes(format)
              ? { outputFormat: 'png', outputCompression: undefined, frameCount: undefined, frameDurationMs: undefined, svgModel: undefined, svgReasoning: undefined } : {}) })}>
        {choices.map(choice => <option key={choice} value={choice} disabled={key === 'outputFormat' && editing && ['svg', 'gif'].includes(choice)}>{optionLabel(choice)}</option>)}
      </select>
    </label>
  );
  const number = (key: 'outputCompression' | 'partialImages' | 'frameCount' | 'frameDurationMs', min: number, max: number, fallback: number) => (
    <label className="block min-w-0 space-y-1.5 text-xs text-[#B8A58D]">{t(`officialImages.${key}`)}
      <input className={fieldClass} name={`officialImage.${key}`} type="number" min={min} max={max} value={value[key] ?? fallback}
        onChange={event => set({ [key]: event.target.value ? Number(event.target.value) : undefined })} />
    </label>
  );
  const summary = [
    value.quality && value.quality !== 'auto' ? `${t('officialImages.quality')} ${optionLabel(value.quality)}` : '',
    format !== 'png' ? format.toUpperCase() : '',
    value.background === 'transparent' ? optionLabel('transparent') : '',
    value.complexity ? `${t('officialImages.complexity')} ${optionLabel(value.complexity)}` : '',
    technicalConfigured ? t('promptNode.advancedConfigured') : '',
  ].filter(Boolean).join(' · ') || t('common.default');
  const error = validateOfficialImageOptions(value, imageModel, referenceCount, false, false);
  return <>
    <AdvancedOptionsSection kind="official-images" summary={summary}>
      <div className="grid grid-cols-2 gap-3">
        {select('quality', capabilities.qualities, 'auto')}
        {select('outputFormat', capabilities.formats, 'png')}
        {select('background', ['auto', 'opaque', 'transparent'], 'auto')}
        {capabilities.complexity && select('complexity', ['', 'low', 'medium', 'high'], '')}
        {['jpeg', 'webp'].includes(format) && number('outputCompression', 0, 100, 100)}
        {format === 'gif' && <>{number('frameCount', 2, 64, 9)}{number('frameDurationMs', 20, 655350, 200)}</>}
      </div>
      {format === 'gif' && <p className="text-xs text-[#B8A58D]">{t('officialImages.gifHint')}</p>}
      {format === 'svg' && <div className="space-y-3">
        <p className="text-xs text-[#B8A58D]">{t('officialImages.svgHint')}</p>
        <label className="block space-y-1.5 text-xs text-[#B8A58D]">{t('officialImages.svgModel')}
          <input className={fieldClass} value={value.svgModel ?? ''} onChange={event => set({ svgModel: event.target.value || undefined, ...(!event.target.value ? { svgReasoning: undefined } : {}) })} />
        </label>
        {value.svgModel && select('svgReasoning', ['', ...SVG_REASONING_VALUES], '')}
      </div>}
      <details data-official-technical className="border-t border-[#F2C14E]/10 pt-3 text-xs text-[#B8A58D]">
        <summary className="cursor-pointer">{t('promptNode.technicalSettings')}{technicalConfigured && ` · ${t('promptNode.advancedConfigured')}`}</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {raster && <label className="space-y-1.5">{t('officialImages.stream')}
              <select name="officialImage.stream" className={fieldClass} value={value.stream === undefined ? '' : String(value.stream)}
                onChange={event => set({ stream: event.target.value === '' ? undefined : event.target.value === 'true', ...(event.target.value === 'false' ? { partialImages: undefined } : {}) })}>
                <option value="">{t('officialImages.default')}</option><option value="true">{t('officialImages.on')}</option><option value="false">{t('officialImages.off')}</option>
              </select>
            </label>}
            {raster && value.stream !== false && number('partialImages', 0, 3, 1)}
            {select('moderation', ['auto', 'low'], 'auto')}
          </div>
          <label className="block space-y-1.5"><span>{t('officialImages.references')}</span>
            <textarea className={fieldClass} rows={3} value={inputDraft} onChange={event => setInputDraft(event.target.value)}
              onBlur={() => set({ imageInputs: inputDraft.split('\n').map(reference).filter((item): item is OfficialImageReference => Boolean(item)) })} />
          </label>
          <p className="text-[11px] leading-relaxed">{t('officialImages.referencesHint')}</p>
          {(['mask', ...(capabilities.markup ? ['markup'] : [])] as Array<'mask' | 'markup'>).map(key => <label key={key} className="block space-y-1.5">{t(`officialImages.${key}`)}
            <input className={fieldClass} placeholder="https://… / file-…" value={value[key]?.file_id ?? value[key]?.image_url ?? ''} onChange={event => set({ [key]: reference(event.target.value) })} />
          </label>)}
          <label className="block space-y-1.5">safety_identifier<input className={fieldClass} maxLength={128} value={value.safetyIdentifier ?? ''} onChange={event => set({ safetyIdentifier: event.target.value || undefined })} /></label>
        </div>
      </details>
    </AdvancedOptionsSection>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </>;
}
