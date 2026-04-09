import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { useStore as useZustandStore } from 'zustand';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '../store';
import { PromptNode } from './nodes/PromptNode';
import { ImageNode } from './nodes/ImageNode';
import { DeletableEdge } from './edges/DeletableEdge';
import { Plus, Sparkles, Undo2, Redo2, LayoutGrid, Maximize2 } from 'lucide-react';

function CanvasInner() {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onConnect = useStore((state) => state.onConnect);
  const addNode = useStore((state) => state.addNode);
  const clearCanvas = useStore((state) => state.clearCanvas);

  const { screenToFlowPosition, fitView } = useReactFlow();

  // History (Undo/Redo)
  const { undo, redo, pastStates, futureStates } = useZustandStore(useStore.temporal, (state) => state);

  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);

  const nodeTypes = useMemo(() => ({
    promptNode: PromptNode,
    imageNode: ImageNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    default: DeletableEdge,
  }), []);

  const handleAddPromptNode = useCallback(() => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    addNode('promptNode', { x: center.x - 160, y: center.y - 100 }, { prompt: '' });
  }, [addNode, screenToFlowPosition]);

  const handleAutoLayout = useCallback(() => {
    // Simple left-to-right tree layout
    const edgeMap = new Map<string, string[]>(); // source -> targets
    const incomingCount = new Map<string, number>();

    edges.forEach(edge => {
      const targets = edgeMap.get(edge.source) || [];
      targets.push(edge.target);
      edgeMap.set(edge.source, targets);
      incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
    });

    const rootNodes = nodes.filter(n => !incomingCount.get(n.id));

    const positions = new Map<string, { x: number; y: number }>();
    const columnHeight = new Map<number, number>(); // tracks next y for each column

    const COL_WIDTH = 450;
    const ROW_HEIGHT = 340;

    const visit = (nodeId: string, col: number) => {
      if (positions.has(nodeId)) return;
      const currentY = columnHeight.get(col) || 0;
      positions.set(nodeId, { x: col * COL_WIDTH + 50, y: currentY });
      columnHeight.set(col, currentY + ROW_HEIGHT);

      const children = edgeMap.get(nodeId) || [];
      children.forEach(childId => visit(childId, col + 1));
    };

    rootNodes.forEach((node) => visit(node.id, 0));

    // Handle disconnected nodes
    nodes.forEach((node, i) => {
      if (!positions.has(node.id)) {
        positions.set(node.id, { x: 50, y: (i + rootNodes.length) * ROW_HEIGHT });
      }
    });

    useStore.setState({
      nodes: nodes.map(n => ({
        ...n,
        position: positions.get(n.id) || n.position,
      }))
    });

    setTimeout(() => fitView({ padding: 0.1, duration: 500 }), 50);
  }, [nodes, edges, fitView]);

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      confirmTimeoutRef.current = setTimeout(() => setConfirmClear(false), 3000);
    } else {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      setConfirmClear(false);
      clearCanvas();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      } else if (e.key === 'f' || e.key === 'F') {
        fitView({ padding: 0.1, duration: 300 });
      } else if (e.key === 'n' || e.key === 'N') {
        handleAddPromptNode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, fitView, handleAddPromptNode]);

  // Context menu handlers
  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setContextMenu({ x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y });
  }, [screenToFlowPosition]);

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className="w-full h-screen" style={{background: '#16130F'}}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className=""
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={['Backspace', 'Delete']}
        onPaneContextMenu={handlePaneContextMenu}
        onPaneClick={handlePaneClick}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="rgba(242,193,78,0.08)" />
        <Controls className="bg-white shadow-lg border-none rounded-xl overflow-hidden" />
        <MiniMap
          className="bg-white shadow-lg rounded-xl overflow-hidden border-none"
          maskColor="rgba(22, 19, 15, 0.8)"
        />

        <Panel position="top-left" className="m-6 flex flex-col gap-4">
          <div className="p-4 rounded-2xl shadow-lg flex items-center gap-3" style={{background: 'rgba(29,26,20,0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(242,193,78,0.2)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)'}}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white shadow-inner">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg tracking-tight">香蕉画图</h1>
              <p className="text-xs font-medium" style={{color: '#96836F'}}>无限画布 AI 创作工具</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className={`backdrop-blur-md px-4 py-2 rounded-xl shadow-sm text-xs font-medium transition-colors w-fit ${confirmClear ? 'text-red-300 bg-red-900/60 border-red-500/30 border' : 'text-red-400 hover:bg-red-900/40'}`}
              style={confirmClear ? undefined : {background: 'rgba(29,26,20,0.92)', border: '1px solid rgba(242,193,78,0.15)'}}
            >
              {confirmClear ? '确认清空?' : '清空画布'}
            </button>

            <div className="p-1 rounded-xl shadow-sm flex items-center gap-1" style={{background: 'rgba(29,26,20,0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(242,193,78,0.15)'}}>
              <button
                onClick={() => undo()}
                disabled={pastStates.length === 0}
                className="p-1.5 hover:bg-[rgba(242,193,78,0.08)] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{color: '#EEE4CE'}}
                title="撤销 (Undo)"
              >
                <Undo2 size={16} />
              </button>
              <button
                onClick={() => redo()}
                disabled={futureStates.length === 0}
                className="p-1.5 hover:bg-[rgba(242,193,78,0.08)] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{color: '#EEE4CE'}}
                title="重做 (Redo)"
              >
                <Redo2 size={16} />
              </button>
              <button
                onClick={handleAutoLayout}
                className="p-1.5 hover:bg-[rgba(242,193,78,0.08)] rounded-lg transition-colors"
                style={{color: '#EEE4CE'}}
                title="自动整理布局"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </Panel>

        <Panel position="bottom-center" className="mb-8">
          <button
            onClick={handleAddPromptNode}
            className="flex items-center gap-2 px-6 py-3 rounded-full transition-all hover:scale-105 hover:-translate-y-1 active:scale-95"
            style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(242,193,78,0.1)'}}
          >
            <Plus size={20} style={{color: '#EEE4CE'}} />
            <span className="font-medium" style={{color: '#EEE4CE'}}>新建创作节点</span>
          </button>
        </Panel>
      </ReactFlow>

      {contextMenu && (
        <div
          className="fixed z-50 rounded-xl shadow-2xl p-1.5 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y, background: 'rgba(22,19,15,0.97)', border: '1px solid rgba(242,193,78,0.2)', backdropFilter: 'blur(16px)' }}
        >
          <button
            onClick={() => {
              addNode('promptNode', { x: contextMenu.flowX - 160, y: contextMenu.flowY - 100 }, { prompt: '' });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[rgba(242,193,78,0.08)] rounded-lg transition-colors text-left"
            style={{color: '#EEE4CE'}}
          >
            <Plus size={15} />
            新建创作节点
          </button>
          <button
            onClick={() => {
              fitView({ padding: 0.1, duration: 300 });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[rgba(242,193,78,0.08)] rounded-lg transition-colors text-left"
            style={{color: '#EEE4CE'}}
          >
            <Maximize2 size={15} />
            适应视口 (F)
          </button>
          <div className="my-1 border-t" style={{borderColor: 'rgba(242,193,78,0.1)'}} />
          <button
            onClick={() => {
              handleAutoLayout();
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[rgba(242,193,78,0.08)] rounded-lg transition-colors text-left"
            style={{color: '#EEE4CE'}}
          >
            <LayoutGrid size={15} />
            自动整理布局
          </button>
        </div>
      )}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
