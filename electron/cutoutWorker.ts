import { InferenceSession, Tensor } from 'onnxruntime-node';
import { CUTOUT_INPUT_SIZE, getCutoutModel, type CutoutRequest } from '../src/lib/cutoutModels';
import { cutoutAlpha } from '../src/lib/cutoutPixels';

process.parentPort.on('message', async ({ data }: { data: CutoutRequest & { modelPath: string } }) => {
  let session: InferenceSession | undefined;
  try {
    session = await InferenceSession.create(data.modelPath, {
      executionProviders: ['cpu'], intraOpNumThreads: 4, interOpNumThreads: 1,
      logSeverityLevel: 3,
      executionMode: 'sequential', enableCpuMemArena: false, enableMemPattern: false,
    });
    const result = await session.run({ [session.inputNames[0]]: new Tensor('float32', data.input, [1, 3, CUTOUT_INPUT_SIZE, CUTOUT_INPUT_SIZE]) });
    const output = result[session.outputNames[0]];
    if (output.type !== 'float32') throw new Error('INVALID_MASK');
    process.parentPort.postMessage({ alpha: cutoutAlpha(output.data as Float32Array, getCutoutModel(data.modelId).family) });
  } catch (error) {
    console.error('[banana:cutout]', error instanceof Error ? error.message : 'Inference failed');
    process.parentPort.postMessage({ error: 'INFERENCE_FAILED' });
  } finally {
    await session?.release();
  }
});
