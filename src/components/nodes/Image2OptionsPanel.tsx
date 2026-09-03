import { Info } from 'lucide-react';
import { useAppTranslation } from '../../i18n';
import {
  getImage2RelayParameterTipKeys,
  normalizeImage2Options,
  type Image2Options,
  type Image2OutputFormat,
  type Image2Quality,
  type Image2ResponseFormat,
} from '../../lib/imageModels';
import { ParameterTipsTooltip } from './ParameterTipsTooltip';

type Image2OptionsPanelProps = {
  value?: Image2Options;
  hasReferenceImages: boolean;
  onChange: (options: Image2Options) => void;
};

const selectStyle = {
  background: '#1D1A14',
  border: '1px solid rgba(242,193,78,0.2)',
  color: '#EEE4CE',
};

const labelStyle = { color: '#96836F' };

export function Image2OptionsPanel({ value, hasReferenceImages, onChange }: Image2OptionsPanelProps) {
  const { t } = useAppTranslation();
  const options = normalizeImage2Options(value);
  const outputFormat = options.outputFormat ?? 'png';
  const supportsCompression = outputFormat === 'jpeg' || outputFormat === 'webp';
  const compression = options.outputCompression ?? 100;
  const partialImages = options.partialImages ?? 1;
  const parameterTips = [
    t('image2Options.tips.onlyImage2'),
    hasReferenceImages
      ? t('image2Options.tips.fidelityAttached')
      : t('image2Options.tips.fidelityEmpty'),
    ...getImage2RelayParameterTipKeys().map((key) => t(key)),
  ];

  const commit = (nextOptions: Image2Options) => {
    onChange(normalizeImage2Options(nextOptions));
  };

  const setOption = (patch: Image2Options) => {
    commit({ ...options, ...patch });
  };

  const setOutputFormat = (nextOutputFormat: Image2OutputFormat) => {
    const nextOptions: Image2Options = { ...options, outputFormat: nextOutputFormat };
    if (nextOutputFormat === 'png') {
      delete nextOptions.outputCompression;
    }
    commit(nextOptions);
  };

  return (
    <div className="space-y-4 rounded-xl p-3" style={{ background: 'rgba(242,193,78,0.04)', border: '1px solid rgba(242,193,78,0.12)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#F2C14E' }}>
          <Info size={13} />
          {t('image2Options.advanced')}
        </div>
        <ParameterTipsTooltip tips={parameterTips} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.quality')}</label>
          <select
            value={options.quality ?? 'auto'}
            onChange={(event) => setOption({ quality: event.target.value as Image2Quality })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="auto">{t('image2Options.qualityAuto')}</option>
            <option value="low">{t('image2Options.qualityLow')}</option>
            <option value="medium">{t('image2Options.qualityMedium')}</option>
            <option value="high">{t('image2Options.qualityHigh')}</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.outputFormat')}</label>
          <select
            value={outputFormat}
            onChange={(event) => setOutputFormat(event.target.value as Image2OutputFormat)}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="png">{t('image2Options.png')}</option>
            <option value="jpeg">{t('image2Options.jpeg')}</option>
            <option value="webp">{t('image2Options.webp')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.responseFormat')}</label>
          <select
            value={options.responseFormat ?? 'b64_json'}
            onChange={(event) => setOption({ responseFormat: event.target.value as Image2ResponseFormat })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="b64_json">b64_json</option>
            <option value="url">url / data URL</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.partialImages')}</label>
          <select
            value={partialImages}
            onChange={(event) => setOption({ partialImages: Number(event.target.value) })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            {[0, 1, 2, 3].map((count) => (
              <option key={count} value={count}>{t('image2Options.imageCount', { count })}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium" style={labelStyle}>
          <span>{t('image2Options.compression')}</span>
          <span style={{ color: supportsCompression ? '#F2C14E' : '#5C4E3E' }}>
            {supportsCompression ? `${compression}%` : t('image2Options.compressionFormats')}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={compression}
          disabled={!supportsCompression}
          onChange={(event) => setOption({ outputCompression: Number(event.target.value) })}
          className="nodrag nowheel w-full accent-[#F2C14E] disabled:opacity-30"
        />
      </div>
    </div>
  );
}
