export const CUTOUT_INPUT_SIZE = 1024;
export const DEFAULT_CUTOUT_MODEL = 'isnet-int8';
export const CUTOUT_MODELS = [
  {
    id: 'isnet-int8', name: 'IS-Net INT8', family: 'isnet', bundled: true,
    bytes: 46731926,
    sha256: '12822218993aedaafd110c1312d111a6fede7dc34d99c982e550f687c12ea32d',
    url: '',
  },
  {
    id: 'isnet-fp32', name: 'IS-Net FP32', family: 'isnet', bundled: false,
    bytes: 178648008,
    sha256: '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx',
  },
  {
    id: 'birefnet-lite-fp32', name: 'BiRefNet Lite FP32', family: 'birefnet', bundled: false,
    bytes: 224005088,
    sha256: '5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333',
    url: 'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx',
  },
] as const;
export type CutoutModelId = typeof CUTOUT_MODELS[number]['id'];
export type CutoutModel = typeof CUTOUT_MODELS[number];
export function getCutoutModel(id: unknown): CutoutModel {
  const model = CUTOUT_MODELS.find((item) => item.id === id);
  if (!model) throw new Error('UNKNOWN_MODEL');
  return model;
}
export type CutoutState = {
  selectedModelId: CutoutModelId;
  installed: CutoutModelId[];
  download?: { modelId: CutoutModelId; received: number; total: number };
  busy: boolean;
};
export type CutoutRequest = { requestId: string; modelId: CutoutModelId; input: Float32Array };
export type CutoutBridge = {
  getState: () => Promise<CutoutState>;
  select: (id: CutoutModelId) => Promise<CutoutState>;
  download: (id: CutoutModelId) => Promise<CutoutState>;
  cancelDownload: () => Promise<void>;
  remove: (id: CutoutModelId) => Promise<CutoutState>;
  run: (request: CutoutRequest) => Promise<Uint8Array>;
  cancel: (requestId: string) => Promise<void>;
  subscribe: (listener: (state: CutoutState) => void) => () => void;
};
export function getCutoutBridge() {
  return (globalThis as typeof globalThis & { bananaDesktop?: { cutout?: CutoutBridge } }).bananaDesktop?.cutout;
}

export const CHECKERBOARD_STYLE = {
  backgroundColor: '#eee',
  backgroundImage: 'conic-gradient(#cdd0d5 25%, #eee 0 50%, #cdd0d5 0 75%, #eee 0)',
  backgroundSize: '20px 20px',
};
