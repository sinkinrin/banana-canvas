import React, { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getStraightPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';

export function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {hovered && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEdges(edges => edges.filter(edge => edge.id !== id));
              }}
              className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow-md transition-colors"
              title="断开连线"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
