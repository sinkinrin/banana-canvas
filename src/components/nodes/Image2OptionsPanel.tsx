import { Info } from 'lucide-react';
import {
  getImage2RelayParameterTips,
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
  const options = normalizeImage2Options(value);
  const outputFormat = options.outputFormat ?? 'png';
  const supportsCompression = outputFormat === 'jpeg' || outputFormat === 'webp';
  const compression = options.outputCompression ?? 100;
  const partialImages = options.partialImages ?? 1;
  const parameterTips = [
    '这些选项只在 Image2 / CLIProxyAPI images 接口下生效；切回 Banana 时不会发送。',
    hasReferenceImages
      ? '当前参考图会由 gpt-image-2 自动高保真处理，不发送 input_fidelity。'
      : '添加参考图后也会自动高保真处理，gpt-image-2 不提供 input_fidelity low/high 开关。',
    ...getImage2RelayParameterTips(),
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
          Image2 高级参数
        </div>
        <ParameterTipsTooltip tips={parameterTips} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>质量</label>
          <select
            value={options.quality ?? 'auto'}
            onChange={(event) => setOption({ quality: event.target.value as Image2Quality })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="auto">auto 自动</option>
            <option value="low">low 快速</option>
            <option value="medium">medium 均衡</option>
            <option value="high">high 高质量</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>输出格式</label>
          <select
            value={outputFormat}
            onChange={(event) => setOutputFormat(event.target.value as Image2OutputFormat)}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="png">png 无损</option>
            <option value="jpeg">jpeg 小体积</option>
            <option value="webp">webp 压缩</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>返回格式</label>
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
          <label className="text-[11px] font-medium" style={labelStyle}>局部图</label>
          <select
            value={partialImages}
            onChange={(event) => setOption({ partialImages: Number(event.target.value) })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value={0}>0 张</option>
            <option value={1}>1 张</option>
            <option value={2}>2 张</option>
            <option value={3}>3 张</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium" style={labelStyle}>
          <span>压缩</span>
          <span style={{ color: supportsCompression ? '#F2C14E' : '#5C4E3E' }}>
            {supportsCompression ? `${compression}%` : '仅 jpeg/webp'}
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
