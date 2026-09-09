# Bundled IS-Net model

`isnet-int8.onnx` is the default offline background-removal model. Electron Builder copies it to `resources/cutout/isnet-int8.onnx`; it is part of the installer and never downloaded at first use.

- Size: 46,731,926 bytes.
- SHA256: `12822218993aedaafd110c1312d111a6fede7dc34d99c982e550f687c12ea32d`.
- Architecture: IS-Net general-use, [xuebinqin/DIS](https://github.com/xuebinqin/DIS).
- Source export: [rembg isnet-general-use.onnx](https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx).
- Source SHA256: `60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a`.
- Conversion: symmetric per-output-channel INT8 convolution weights, explicit ONNX DequantizeLinear. Activations and computation remain FP32. This reduces distribution size; it does not promise full INT8 arithmetic or reduced runtime memory. No calibration photos are embedded.
- Reproducer: `python scripts/quantize-isnet.py source.onnx assets/models/isnet-int8.onnx` with Python 3.13, onnx 1.20.1 and numpy 2.4.3.
- This is our conversion of the rembg export, not the separately AGPL-labelled IMG.LY/onnx-community ISNet conversion.

Original project terms: https://github.com/xuebinqin/DIS#7-term-of-use (code and evaluation under Apache-2.0). Upstream provenance, Apache-2.0 text and runtime notices are included in `public/THIRD_PARTY_NOTICES.txt` and `public/licenses/`.

Optional downloadable models are defined in `src/lib/cutoutModels.ts`: IS-Net FP32 (178.6 MB) and BiRefNet Lite FP32 (224.0 MB). Downloaded files are SHA256 checked and atomically installed under Electron's userData/cutout-models directory. Only downloaded models can be removed; the bundled default is protected. The selected model is saved independently from project state.

BiRefNet Lite uses the FP32 export for CPU compatibility. The 114.5 MB FP16 export was tried on this Windows CPU path but failed to finish within a 60-second observation; smaller weight files do not automatically mean faster CPU inference.
