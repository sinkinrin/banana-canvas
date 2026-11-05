import { useEffect, useState } from 'react';
import { useAppTranslation } from '../../i18n';
import { getOfficialImageCapabilities, SVG_REASONING_VALUES, validateOfficialImageOptions, type OfficialImageModelId, type OfficialImageOptions, type OfficialImageReference } from '../../lib/officialImages';

type Props = { imageModel: OfficialImageModelId; value?: OfficialImageOptions; referenceCount: number; onChange: (value: OfficialImageOptions) => void };
const fieldClass = 'nowheel w-full rounded-lg border border-[#F2C14E]/20 bg-[#1D1A14] p-2 text-xs text-[#EEE4CE]';
function reference(value: string): OfficialImageReference | undefined {
  const text = value.trim(); return !text ? undefined : text.startsWith('file-') ? { file_id: text } : { image_url: text };
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
  const select = (key: 'quality' | 'complexity' | 'background' | 'outputFormat' | 'moderation' | 'svgReasoning', choices: readonly string[], fallback: string) => <label className="block space-y-1 text-[11px] text-[#B8A58D]">{t(`officialImages.${key}`)}<select className={fieldClass} name={`officialImage.${key}`} value={value[key] ?? fallback} onChange={event => key === 'outputFormat' ? setFormat(event.target.value as OfficialImageOptions['outputFormat']) : set({ [key]: event.target.value || undefined })}>{choices.map(choice => <option key={choice} value={choice} disabled={key === 'outputFormat' && editing && ['svg', 'gif'].includes(choice)}>{choice || t('officialImages.default')}</option>)}</select></label>;
  const number = (key: 'n' | 'outputCompression' | 'partialImages' | 'frameCount' | 'frameDurationMs', min: number, max: number, fallback: number) => <label className="block space-y-1 text-[11px] text-[#B8A58D]">{t(`officialImages.${key}`)}<input className={fieldClass} name={`officialImage.${key}`} type="number" min={min} max={max} value={value[key] ?? fallback} onChange={event => set({ [key]: event.target.value ? Number(event.target.value) : undefined })} /></label>;
  const error = validateOfficialImageOptions(value, imageModel, referenceCount, false, false);
  return <details data-advanced-options="official-images" open className="space-y-3 rounded-xl border border-[#F2C14E]/15 p-3">
    <summary className="cursor-pointer text-xs text-[#F2C14E]">{t('officialImages.options')}</summary>
    <div className="grid grid-cols-2 gap-3">
      {select('quality', capabilities.qualities, 'auto')}
      {capabilities.complexity && select('complexity', ['', 'low', 'medium', 'high'], '')}
      {select('outputFormat', capabilities.formats, 'png')}
      {select('background', ['auto', 'opaque', 'transparent'], 'auto')}
      {select('moderation', ['auto', 'low'], 'auto')}
      {format !== 'svg' && number('n', 1, 10, 1)}
      {['jpeg', 'webp'].includes(format) && number('outputCompression', 0, 100, 100)}
      {raster && <label className="space-y-1 text-[11px] text-[#B8A58D]">{t('officialImages.stream')}<select name="officialImage.stream" className={fieldClass} value={value.stream === undefined ? '' : String(value.stream)} onChange={event => set({ stream: event.target.value === '' ? undefined : event.target.value === 'true', ...(event.target.value === 'false' ? { partialImages: undefined } : {}) })}><option value="">{t('officialImages.default')}</option><option value="true">{t('officialImages.on')}</option><option value="false">{t('officialImages.off')}</option></select></label>}
      {raster && value.stream !== false && number('partialImages', 0, 3, 1)}
      {format === 'gif' && <>{number('frameCount', 2, 64, 9)}{number('frameDurationMs', 20, 655350, 200)}</>}
    </div>
    <label className="block space-y-1 text-[11px] text-[#B8A58D]">{t('officialImages.size')}<input name="officialImage.size" className={fieldClass} placeholder="auto / 1536x864" value={value.size ?? ''} onChange={event => set({ size: event.target.value || undefined })} /></label>
    {format === 'gif' && <p className="text-[11px] text-[#B8A58D]">{t('officialImages.gifHint')}</p>}
    {format === 'svg' && <div className="space-y-3"><p className="text-[11px] text-[#B8A58D]">{t('officialImages.svgHint')}</p><label className="block space-y-1 text-[11px] text-[#B8A58D]">{t('officialImages.svgModel')}<input className={fieldClass} value={value.svgModel ?? ''} onChange={event => set({ svgModel: event.target.value || undefined, ...(!event.target.value ? { svgReasoning: undefined } : {}) })} /></label>{value.svgModel && select('svgReasoning', ['', ...SVG_REASONING_VALUES], '')}</div>}
    <details className="space-y-3 text-[11px] text-[#B8A58D]"><summary className="cursor-pointer">{t('officialImages.references')}</summary>
      <p>{t('officialImages.referencesHint')}</p>
      <textarea aria-label={t('officialImages.references')} className={fieldClass} rows={3} value={inputDraft} onChange={event => setInputDraft(event.target.value)} onBlur={() => set({ imageInputs: inputDraft.split('\n').map(reference).filter((item): item is OfficialImageReference => Boolean(item)) })} />
      {(['mask', ...(capabilities.markup ? ['markup'] : [])] as Array<'mask' | 'markup'>).map(key => <label key={key} className="block space-y-1">{t(`officialImages.${key}`)}<input className={fieldClass} placeholder="https://… / file-…" value={value[key]?.file_id ?? value[key]?.image_url ?? ''} onChange={event => set({ [key]: reference(event.target.value) })} /></label>)}
    </details>
    <label className="block space-y-1 text-[11px] text-[#B8A58D]">safety_identifier<input className={fieldClass} maxLength={128} value={value.safetyIdentifier ?? ''} onChange={event => set({ safetyIdentifier: event.target.value || undefined })} /></label>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </details>;
}
