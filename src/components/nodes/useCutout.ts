import { useRef, useState } from 'react';
import { useStore } from '../../store';
import { getCutoutBridge } from '../../lib/cutoutModels';
import { imageAssetFromDataUrl } from '../../lib/canvasState';
import { cutoutErrorMessage, removeImageBackground } from '../../services/cutout';
import { useAppTranslation } from '../../i18n';

const jobs = new Map<string, AbortController>();
export function cancelCutout(id: string) {
  jobs.get(id)?.abort();
  void getCutoutBridge()?.cancel(id).catch(() => {});
}

export function useCutout(sourceNodeId: string) {
  const { t } = useAppTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  async function start(url: string, sourceImageAssetId?: string) {
    if (controller.current) return;
    const sourceAtStart = useStore.getState().nodes.find((node) => node.id === sourceNodeId);
    if (!sourceAtStart) return;
    const abortController = new AbortController();
    controller.current = abortController;
    setBusy(true);
    setError(undefined);
    let resultId: string | undefined;
    let unsubscribe: (() => void) | undefined;
    try {
      const bridge = getCutoutBridge();
      if (!bridge) throw new Error('DESKTOP_ONLY');
      const state = await bridge.getState();
      abortController.signal.throwIfAborted();
      if (state.busy) throw new Error('BUSY');
      const store = useStore.getState();
      const source = store.nodes.find((node) => node.id === sourceNodeId);
      if (!source || source.data !== sourceAtStart.data) throw new Error('CANCELLED');
      const position = { x: source.position.x + 600, y: source.position.y };
      while (store.nodes.some((node) => Math.abs(node.position.x - position.x) < 450 && Math.abs(node.position.y - position.y) < 550)) position.y += 600;
      const sourceAsset = sourceImageAssetId ? undefined : imageAssetFromDataUrl(url);
      resultId = store.addNode('imageNode', position, {
        generationMode: 'cutout', cutoutModelId: state.selectedModelId,
        generationTitle: t('cutout.title'), createdAt: new Date().toISOString(), isLoading: true,
        sourceImageAssetId,
        sourceImage: sourceAsset ? { data: sourceAsset.data, mimeType: sourceAsset.mimeType, url } : undefined,
      });
      jobs.set(resultId, abortController);
      // React Flow virtualizes off-screen nodes. Only losing the result from
      // project state cancels the job; unmounting this component must not.
      unsubscribe = useStore.subscribe((current) => {
        if (!current.nodes.some((node) => node.id === resultId)) abortController.abort();
      });
      const imageUrl = await removeImageBackground(url, state.selectedModelId, resultId, abortController.signal);
      abortController.signal.throwIfAborted();
      useStore.getState().updateNodeData(resultId, { imageUrl, isLoading: false, error: undefined });
    } catch (failure) {
      const message = abortController.signal.aborted ? t('cutout.errors.CANCELLED') : cutoutErrorMessage(failure);
      if (resultId) useStore.getState().updateNodeData(resultId, { isLoading: false, error: message });
      else if (!abortController.signal.aborted) setError(message);
    } finally {
      unsubscribe?.();
      if (resultId) jobs.delete(resultId);
      controller.current = undefined;
      setBusy(false);
    }
  }
  return { start, busy, error, supported: Boolean(getCutoutBridge()) };
}
