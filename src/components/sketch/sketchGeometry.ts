import type { Camera, Editor } from '@quickdrawjs/react';

import type { BananaAspectRatio } from '../../lib/imageModels';
import type {
  CanvasSketchSavePayload,
  InlineImageData,
} from '../../lib/canvasState';

export type SketchArtboard = {
  width: number;
  height: number;
};

export type SketchSavePayload = CanvasSketchSavePayload;

const ARTBOARD_LONG_EDGE = 1024;
const OUTPUT_LONG_EDGE = 2048;

export function getAspectRatioValue(aspectRatio: BananaAspectRatio) {
  const [width, height] = aspectRatio.split(':').map(Number);
  return width / height;
}

export function getSketchArtboard(aspectRatio: BananaAspectRatio): SketchArtboard {
  const ratio = getAspectRatioValue(aspectRatio);
  if (ratio >= 1) {
    return { width: ARTBOARD_LONG_EDGE, height: ARTBOARD_LONG_EDGE / ratio };
  }

  return { width: ARTBOARD_LONG_EDGE * ratio, height: ARTBOARD_LONG_EDGE };
}

export function getSketchOutputSize(
  aspectRatio: BananaAspectRatio,
  longEdge = OUTPUT_LONG_EDGE
) {
  const ratio = getAspectRatioValue(aspectRatio);
  if (ratio >= 1) {
    return { width: longEdge, height: Math.max(1, Math.round(longEdge / ratio)) };
  }

  return { width: Math.max(1, Math.round(longEdge * ratio)), height: longEdge };
}

export function getFixedArtboardCamera(
  container: { width: number; height: number },
  artboard: SketchArtboard
): Camera {
  const safeWidth = Math.max(1, container.width);
  const safeHeight = Math.max(1, container.height);
  const zoom = Math.min(safeWidth / artboard.width, safeHeight / artboard.height);

  return {
    z: zoom,
    x: safeWidth / 2 / zoom - artboard.width / 2,
    y: safeHeight / 2 / zoom - artboard.height / 2,
  };
}

function canvasToInlinePng(canvas: HTMLCanvasElement): InlineImageData {
  const url = canvas.toDataURL('image/png');
  const match = url.match(/^data:(image\/png);base64,(.+)$/);
  if (!match) throw new Error('无法导出草图 PNG。');
  return { mimeType: match[1], data: match[2], url };
}

export function exportFixedArtboardPng(
  editor: Editor,
  aspectRatio: BananaAspectRatio
): InlineImageData {
  const artboard = getSketchArtboard(aspectRatio);
  const output = getSketchOutputSize(aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建草图导出画布。');

  const zoom = output.width / artboard.width;
  editor.renderScene(
    context,
    { x: 0, y: 0, z: zoom },
    output.width,
    output.height,
    { dpr: 1, background: true }
  );

  return canvasToInlinePng(canvas);
}
