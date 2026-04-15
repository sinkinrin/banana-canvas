import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { temporal } from 'zundo';
import { get, set, del } from 'idb-keyval';
import {
  Connection,
  Edge,
  EdgeChange,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import {
  areHistoryStatesEqual,
  collectReferencedAssetIdsFromHistory,
  createHistorySnapshot,
  migrateCanvasNodesToAssetIds,
  normalizeNodeDataWithAssets,
  pruneAssets,
  type CanvasImageAsset,
  type CanvasNode,
  type CanvasNodeData,
} from './lib/canvasState';

type BananaStoreGlobals = typeof globalThis & {
  __bananaTemporalAssetsUnsub?: () => void;
  __bananaHydrationAssetsUnsub?: () => void;
  __bananaAssetPersistUnsub?: () => void;
};

const ASSET_STORAGE_KEY = 'banana-art-assets';
let pruneStoreAssetsNow: (() => void) | undefined;

// Custom storage for IndexedDB
const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

export type AppNodeData = CanvasNodeData;

export type AppNode = CanvasNode;

export type AppState = {
  nodes: AppNode[];
  edges: Edge[];
  assets: Record<string, CanvasImageAsset>;
  assetsHydrated: boolean;
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: string, position: { x: number; y: number }, data?: any) => string;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<AppNodeData>) => void;
  clearCanvas: () => void;
};

export const useStore = create<AppState>()(
  temporal(
    persist(
      (set, get, store) => {
        const globalStore = globalThis as BananaStoreGlobals;
        const temporalStore = store.temporal as {
          subscribe: (listener: () => void) => () => void;
          getState: () => {
            pastStates: Array<{ nodes: AppNode[] }>;
            futureStates: Array<{ nodes: AppNode[] }>;
          };
        };
        const snapshotAssetIdCache = new WeakMap<object, string[]>();
        const getSnapshotAssetIds = (snapshot: { nodes: AppNode[] }) => {
          const snapshotKey = snapshot as object;
          const cachedAssetIds = snapshotAssetIdCache.get(snapshotKey);
          if (cachedAssetIds) return cachedAssetIds;

          const assetIds = [...collectReferencedAssetIdsFromHistory([snapshot])];
          snapshotAssetIdCache.set(snapshotKey, assetIds);
          return assetIds;
        };

        const collectPinnedAssetIds = () => {
          const currentNodes = get().nodes;
          const ids = new Set<string>();
          const currentReferencedIds = collectReferencedAssetIdsFromHistory([{ nodes: currentNodes }]);
          const temporalState = temporalStore.getState();

          currentReferencedIds.forEach((id) => ids.add(id));
          [...temporalState.pastStates, ...temporalState.futureStates].forEach((snapshot) => {
            getSnapshotAssetIds(snapshot).forEach((id) => ids.add(id));
          });

          return ids;
        };

        const hasSameAssetKeys = (
          left: Record<string, CanvasImageAsset>,
          right: Record<string, CanvasImageAsset>
        ) => {
          const leftKeys = Object.keys(left);
          const rightKeys = Object.keys(right);

          if (leftKeys.length !== rightKeys.length) return false;

          return leftKeys.every((key) => key in right);
        };

        const pruneStoreAssets = () => {
          const state = get();
          const nextAssets = pruneAssets(state.assets, collectPinnedAssetIds());
          if (hasSameAssetKeys(state.assets, nextAssets)) return;
          set({ assets: nextAssets });
        };

        globalStore.__bananaTemporalAssetsUnsub?.();
        globalStore.__bananaTemporalAssetsUnsub = temporalStore.subscribe(pruneStoreAssets);
        queueMicrotask(pruneStoreAssets);
        pruneStoreAssetsNow = pruneStoreAssets;

        return ({
        nodes: [
          {
            id: 'initial-node',
            type: 'promptNode',
            position: { x: 250, y: 250 },
            data: { prompt: '一只可爱的香蕉在太空中遨游，赛博朋克风格' },
          },
        ],
        edges: [],
        assets: {},
        assetsHydrated: false,
        onNodesChange: (changes: NodeChange<AppNode>[]) => {
          const currentNodes = get().nodes;
          const nextNodes = applyNodeChanges(changes, currentNodes);
          set({
            nodes: nextNodes,
          });
        },
        onEdgesChange: (changes: EdgeChange[]) => {
          set({
            edges: applyEdgeChanges(changes, get().edges),
          });
        },
        onConnect: (connection: Connection) => {
          set({
            edges: addEdge(connection, get().edges),
          });
        },
        addNode: (type, position, data = {}) => {
          const newId = uuidv4();
          const normalized = normalizeNodeDataWithAssets(data, get().assets);
          const newNode: AppNode = {
            id: newId,
            type,
            position,
            data: normalized.data,
          };
          set({
            nodes: [...get().nodes, newNode],
            assets: normalized.assets,
          });
          return newId;
        },
        deleteNode: (id) => {
          set({
            nodes: get().nodes.filter((node) => node.id !== id),
            edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id),
          });
        },
        updateNodeData: (id, data) => {
          const currentNode = get().nodes.find((node) => node.id === id);
          if (!currentNode) return;

          const normalized = normalizeNodeDataWithAssets(
            { ...currentNode.data, ...data },
            get().assets
          );

          set({
            nodes: get().nodes.map((node) =>
              node.id === id ? { ...node, data: normalized.data } : node
            ),
            assets: normalized.assets,
          });
        },
        clearCanvas: () => {
          set({
            nodes: [],
            edges: [],
          });
        },
      })},
      {
        name: 'banana-art-storage',
        storage: createJSONStorage(() => storage),
        partialize: (state) => createHistorySnapshot({
          nodes: state.nodes,
          edges: state.edges,
          assets: state.assets,
        }),
        merge: (persistedState, currentState) => {
          const typedPersistedState = persistedState as Partial<Pick<AppState, 'nodes' | 'edges'>>;
          const migrated = migrateCanvasNodesToAssetIds(
            typedPersistedState.nodes ?? currentState.nodes,
            currentState.assets
          );

          return {
            ...currentState,
            ...typedPersistedState,
            nodes: migrated.nodes,
            edges: typedPersistedState.edges ?? currentState.edges,
            assets: migrated.assets,
            assetsHydrated: false,
          };
        },
      }
    ),
    {
      // Only track nodes and edges for history
      partialize: (state) => createHistorySnapshot({
        nodes: state.nodes,
        edges: state.edges,
        assets: state.assets,
      }),
      equality: areHistoryStatesEqual,
      // Limit history size
      limit: 50,
    }
  )
);

const globalStore = globalThis as BananaStoreGlobals;
globalStore.__bananaHydrationAssetsUnsub?.();

let lastPersistedAssetSignature = '';
let assetsHydrated = false;

const getCurrentAssetSignature = () => {
  const currentAssetIds = [...collectReferencedAssetIdsFromHistory([{ nodes: useStore.getState().nodes }])].sort();
  return currentAssetIds.join('|');
};

const persistCurrentAssets = async () => {
  if (!assetsHydrated) return;

  const signature = getCurrentAssetSignature();
  if (signature === lastPersistedAssetSignature) return;

  const currentAssetIds = new Set(signature ? signature.split('|') : []);
  const assets = pruneAssets(useStore.getState().assets, currentAssetIds);

  if (Object.keys(assets).length === 0) {
    await del(ASSET_STORAGE_KEY);
  } else {
    await set(ASSET_STORAGE_KEY, assets);
  }

  lastPersistedAssetSignature = signature;
};

globalStore.__bananaAssetPersistUnsub?.();
globalStore.__bananaAssetPersistUnsub = useStore.subscribe(() => {
  void persistCurrentAssets();
});

globalStore.__bananaHydrationAssetsUnsub = (
  useStore.persist as unknown as {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  }
).onFinishHydration(() => {
  pruneStoreAssetsNow?.();
  void get(ASSET_STORAGE_KEY).then((persistedAssets) => {
    const nextAssets = pruneAssets(
      {
        ...useStore.getState().assets,
        ...((persistedAssets as Record<string, CanvasImageAsset> | undefined) ?? {}),
      },
      collectReferencedAssetIdsFromHistory([{ nodes: useStore.getState().nodes }])
    );
    assetsHydrated = true;
    useStore.setState({ assets: nextAssets, assetsHydrated: true });
    lastPersistedAssetSignature = '';
    void persistCurrentAssets();
  });
});

if (
  (useStore.persist as unknown as { hasHydrated: () => boolean }).hasHydrated()
) {
  pruneStoreAssetsNow?.();
  void get(ASSET_STORAGE_KEY).then((persistedAssets) => {
    const nextAssets = pruneAssets(
      {
        ...useStore.getState().assets,
        ...((persistedAssets as Record<string, CanvasImageAsset> | undefined) ?? {}),
      },
      collectReferencedAssetIdsFromHistory([{ nodes: useStore.getState().nodes }])
    );
    assetsHydrated = true;
    useStore.setState({ assets: nextAssets, assetsHydrated: true });
    lastPersistedAssetSignature = '';
    void persistCurrentAssets();
  });
}
