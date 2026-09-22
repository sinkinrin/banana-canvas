import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReferenceImage } from './referenceImageFormat';
import { prepareReferenceImages } from './prepareReferenceImages';
import { extractReferencePrimaryImages } from '../server/prepareReferenceImages';

const segment = (marker: number, payload: number[]) => [255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const scan = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 10, 255, 0, 21, 255, 0xd0, 11];
const exif = segment(0xe1, [69, 120, 105, 102, 0, 0, 255, 217]); // Contains a false EOI inside metadata.
const mpf = segment(0xe2, [77, 80, 70, 0, 0, 0]);
const jpeg = Buffer.from([255, 216, ...exif, ...scan, 255, 217]);
const mpo = Buffer.from([255, 216, ...mpf, ...exif, ...scan, 255, 217, ...jpeg]);
const input = (bytes: Uint8Array, mimeType = 'image/jpeg') => ({data: Buffer.from(bytes).toString('base64'), mimeType});

test('MPO extraction preserves compressed primary scan and EXIF, removes MPF and secondary images without mutation', () => {
  const original = Buffer.from(mpo);
  const prepared = inspectReferenceImage(mpo);
  assert.deepEqual(Buffer.from(prepared.bytes), jpeg);
  assert.equal(prepared.primaryFrame, true);
  assert.equal(prepared.convert, false);
  assert.deepEqual(mpo, original);
  assert.deepEqual(extractReferencePrimaryImages([input(mpo)]), [input(jpeg)]);
  assert.equal(inspectReferenceImage(jpeg).bytes, jpeg);
});

test('MPO extraction handles progressive scans and rejects truncation instead of emitting damaged data', () => {
  const progressive = Buffer.from([255,216,...mpf,...scan,...segment(0xc4,[1,2]),...scan,255,217,...jpeg]);
  const expected = Buffer.from([255,216,...scan,...segment(0xc4,[1,2]),...scan,255,217]);
  assert.deepEqual(Buffer.from(inspectReferenceImage(progressive).bytes), expected);
  assert.throws(() => inspectReferenceImage(mpo.subarray(0,20)));
  assert.throws(() => inspectReferenceImage(jpeg.subarray(0,jpeg.length - 2)));
});

test('special color modes and first-frame formats request conversion; ordinary PNG and WebP pass through', () => {
  const cmyk = Buffer.from([255,216,...segment(0xc0,[8,0,1,0,1,4]),...scan,255,217]);
  assert.equal(inspectReferenceImage(cmyk).convert, true);
  const png = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.writeUInt32BE(13,8); png.write('IHDR',12); png[24]=8; png[25]=6;
  assert.equal(inspectReferenceImage(png).convert,false);
  png[24]=16;
  assert.equal(inspectReferenceImage(png).convert,true);
  assert.equal(inspectReferenceImage(Buffer.from('GIF89a')).primaryFrame,true);
  const webp = Buffer.alloc(30); webp.write('RIFF'); webp.write('WEBP',8); webp.write('VP8X',12);
  assert.equal(inspectReferenceImage(webp).convert,false);
  webp[20]=2;
  assert.equal(inspectReferenceImage(webp).convert,true);
  const avif = Buffer.alloc(32); avif.write('ftypavif',4);
  assert.equal(inspectReferenceImage(avif).mimeType,'image/avif');
});

test('all references are prepared in order, MIME is corrected, originals stay unchanged and conversion errors name the image', async () => {
  const references = [input(mpo,'image/png'),input(Buffer.from('GIF89a'),'image/gif')];
  const original = structuredClone(references);
  const converted = {data: Buffer.from('converted').toString('base64'),mimeType:'image/png'};
  const result = await prepareReferenceImages(references, undefined, async (_,mimeType) => {
    assert.equal(mimeType,'image/gif'); return converted;
  });
  assert.deepEqual(result,[input(jpeg),converted]);
  assert.deepEqual(references, original);
  await assert.rejects(prepareReferenceImages(references,undefined,async () => { throw new Error('decoder failed'); }), /2/);
  await assert.rejects(prepareReferenceImages(references,AbortSignal.abort()), {name:'AbortError'});
  await assert.rejects(prepareReferenceImages(references,undefined,async () => ({data:Buffer.alloc(17*1024*1024).toString('base64'),mimeType:'image/png'})), /16 MiB/);
});
