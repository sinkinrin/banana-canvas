import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';

import { ImageNode, canRerunImageNode, getRerunReferenceImages } from './ImageNode';
import type { AppNode } from '../../store';

test('canRerunImageNode disables rerun for mask edit results', () => {
  assert.equal(
    canRerunImageNode({
      prompt: '改帽子',
      imageModel: 'image2',
      generationMode: 'mask-edit',
    }),
    false
  );
});

test('getRerunReferenceImages resolves saved reference assets for standard reruns', () => {
  assert.deepEqual(
    getRerunReferenceImages(
      {
        prompt: '照着参考图画',
        imageModel: 'image2',
        referenceImageIds: ['ref-1'],
      },
      {
        'ref-1': {
          id: 'ref-1',
          data: 'base64-ref',
          mimeType: 'image/png',
        },
      }
    ),
    [{ data: 'base64-ref', mimeType: 'image/png' }]
  );
});

test('ImageNode does not render rerun control for mask edit results', () => {
  const node = {
    id: 'image-1',
    type: 'imageNode',
    position: { x: 0, y: 0 },
    data: {
      prompt: '改帽子',
      imageModel: 'image2',
      generationMode: 'mask-edit',
      imageUrl: 'https://example.com/image.png',
      sourceImageAssetId: 'missing-source',
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <ImageNode
        id={node.id}
        type={node.type}
        data={node.data}
        selected={false}
        zIndex={0}
        isConnectable={true}
        deletable={true}
        selectable={true}
        draggable={true}
        dragging={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>
  );

  assert.doesNotMatch(html, /title="重新生成"/);
});

test('ImageNode protects every result action from canvas dragging and exposes rerun', () => {
  const node = {
    id: 'image-actions',
    type: 'imageNode',
    position: { x: 0, y: 0 },
    data: {
      prompt: '生成一张海报',
      imageModel: 'banana',
      imageUrl: 'data:image/png;base64,aW1hZ2U=',
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <ImageNode
        id={node.id}
        type={node.type}
        data={node.data}
        selected={false}
        zIndex={0}
        isConnectable={true}
        deletable={true}
        selectable={true}
        draggable={true}
        dragging={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>
  );

  assert.match(html, /nodrag nopan nowheel/);
  assert.match(html, /aria-label="重新生成"/);
  assert.match(html, /title="复制图片"/);
  assert.match(html, /title="以此为参考新建节点"/);
  assert.equal((html.match(/<button\b/g) ?? []).length, (html.match(/<button\b[^>]*type="button"/g) ?? []).length);
});
