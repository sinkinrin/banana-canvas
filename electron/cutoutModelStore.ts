import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CUTOUT_MODELS, DEFAULT_CUTOUT_MODEL, getCutoutModel, type CutoutModel, type CutoutModelId, type CutoutState } from '../src/lib/cutoutModels';

export class CutoutModelStore {
  private selected: CutoutModelId = DEFAULT_CUTOUT_MODEL;
  private initialized?: Promise<void>;
  private downloading?: AbortController;
  private progress?: CutoutState['download'];
  constructor(
    private directory: string,
    private bundledPath: string,
    private fetchModel: typeof fetch,
    private changed: () => void,
  ) {}

  private async initialize() {
    this.initialized ??= (async () => {
      await fs.mkdir(this.directory, { recursive: true });
      try {
        const saved = JSON.parse(await fs.readFile(path.join(this.directory, 'preferences.json'), 'utf8'));
        this.selected = getCutoutModel(saved.selectedModelId).id;
      } catch { this.selected = DEFAULT_CUTOUT_MODEL; }
    })();
    await this.initialized;
  }
  modelPath(model: CutoutModel) {
    return model.bundled ? this.bundledPath : path.join(this.directory, `${model.id}.onnx`);
  }
  async getState(): Promise<CutoutState> {
    await this.initialize();
    const installed = (await Promise.all(CUTOUT_MODELS.map(async (model) => {
      const stat = await fs.stat(this.modelPath(model)).catch(() => undefined);
      return stat?.size === model.bytes ? model.id : undefined;
    }))).filter((id): id is CutoutModelId => id !== undefined);
    if (!installed.includes(this.selected)) this.selected = DEFAULT_CUTOUT_MODEL;
    return { selectedModelId: this.selected, installed, download: this.progress, busy: false };
  }
  async verifiedPath(id: unknown) {
    const model = getCutoutModel(id);
    const file = this.modelPath(model);
    const hash = createHash('sha256');
    try {
      for await (const chunk of createReadStream(file)) hash.update(chunk);
    } catch { throw new Error('MODEL_MISSING'); }
    if (hash.digest('hex') !== model.sha256) throw new Error('MODEL_CORRUPT');
    return file;
  }
  async select(id: unknown) {
    await this.initialize();
    const model = getCutoutModel(id);
    await this.verifiedPath(model.id);
    const file = path.join(this.directory, 'preferences.json');
    await fs.writeFile(file + '.tmp', JSON.stringify({ selectedModelId: model.id }));
    await fs.rename(file + '.tmp', file);
    this.selected = model.id;
    this.changed();
    return this.getState();
  }
  async download(id: unknown) {
    await this.initialize();
    const model = getCutoutModel(id);
    if (model.bundled) throw new Error('BUNDLED_MODEL');
    if (this.downloading) throw new Error('DOWNLOAD_BUSY');
    const controller = new AbortController();
    this.downloading = controller;
    this.progress = { modelId: model.id, received: 0, total: model.bytes };
    this.changed();
    const file = this.modelPath(model);
    const partial = file + '.part';
    const timeout = setTimeout(() => controller.abort(), 15 * 60_000);
    try {
      const response = await this.fetchModel(model.url, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('DOWNLOAD_FAILED');
      const hash = createHash('sha256');
      let received = 0;
      let lastUpdate = 0;
      await pipeline(
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
        new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
          received += chunk.length;
          if (received > model.bytes) { callback(new Error('MODEL_CORRUPT')); return; }
          hash.update(chunk);
          this.progress = { modelId: model.id, received, total: model.bytes };
          if (Date.now() - lastUpdate > 200) { lastUpdate = Date.now(); this.changed(); }
          callback(null, chunk);
        } }),
        createWriteStream(partial),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) throw new Error('CANCELLED');
      if (received !== model.bytes || hash.digest('hex') !== model.sha256) throw new Error('MODEL_CORRUPT');
      await fs.rename(partial, file);
    } catch (error) {
      await fs.rm(partial, { force: true });
      if (controller.signal.aborted) throw new Error('CANCELLED');
      throw error;
    } finally {
      clearTimeout(timeout);
      this.downloading = undefined;
      this.progress = undefined;
      this.changed();
    }
    return this.getState();
  }
  cancelDownload() { this.downloading?.abort(); }
  async remove(id: unknown) {
    const model = getCutoutModel(id);
    if (model.bundled) throw new Error('BUNDLED_MODEL');
    if (this.progress?.modelId === model.id) throw new Error('DOWNLOAD_BUSY');
    await this.initialize();
    if (this.selected === model.id) await this.select(DEFAULT_CUTOUT_MODEL);
    await fs.rm(this.modelPath(model), { force: true });
    this.changed();
    return this.getState();
  }
}
