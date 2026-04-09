import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { temporal } from 'zundo';
import { get, set, del } from 'idb-keyval';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

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

export type AppNodeData = {
  prompt?: string;
  aspectRatio?: string;
  imageSize?: string;
  batchCount?: number;
  referenceImages?: Array<{
    data: string;
    mimeType: string;
    url: string;
  }> | null;
  // Keep old field for backward compat migration
  referenceImage?: { data: string; mimeType: string; url: string; } | null;
  imageUrl?: string;
  isLoading?: boolean;
  error?: string;
  color?: string;
  onGenerate?: (id: string, prompt: string, params: any) => void;
};

export type AppNode = Node<AppNodeData>;

export type AppState = {
  nodes: AppNode[];
  edges: Edge[];
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
      (set, get) => ({
        nodes: [
          {
            id: 'initial-node',
            type: 'promptNode',
            position: { x: 250, y: 250 },
            data: { prompt: '一只可爱的香蕉在太空中遨游，赛博朋克风格' },
          },
        ],
        edges: [],
        onNodesChange: (changes: NodeChange<AppNode>[]) => {
          set({
            nodes: applyNodeChanges(changes, get().nodes),
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
          const newNode: AppNode = {
            id: newId,
            type,
            position,
            data,
          };
          set({ nodes: [...get().nodes, newNode] });
          return newId;
        },
        deleteNode: (id) => {
          set({
            nodes: get().nodes.filter((node) => node.id !== id),
            edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id),
          });
        },
        updateNodeData: (id, data) => {
          set({
            nodes: get().nodes.map((node) =>
              node.id === id ? { ...node, data: { ...node.data, ...data } } : node
            ),
          });
        },
        clearCanvas: () => {
          set({ nodes: [], edges: [] });
        },
      }),
      {
        name: 'banana-art-storage',
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({
          nodes: state.nodes.map(node => ({
            ...node,
            data: {
              ...node.data,
              isLoading: false,
              error: undefined
            }
          })),
          edges: state.edges,
        }),
      }
    ),
    {
      // Only track nodes and edges for history
      partialize: (state) => ({
        nodes: state.nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            isLoading: false,
            error: undefined
          }
        })),
        edges: state.edges,
      }),
      // Limit history size
      limit: 50,
    }
  )
);
