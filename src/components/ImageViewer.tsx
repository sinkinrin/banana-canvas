import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Download, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ImageViewerProps {
  imageUrl: string;
  prompt?: string;
  onClose: () => void;
}

export function ImageViewer({ imageUrl, prompt, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `banana-art-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopy = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image: ', err);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center overflow-hidden"
        onMouseUp={handleMouseUp}
        onDoubleClick={onClose}
      >
        {/* Toolbar */}
        <div 
          className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900/80 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl z-10"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setScale(prev => Math.max(0.5, prev - 0.2))}
            className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors"
            title="缩小"
          >
            <ZoomOut size={20} />
          </button>
          <div className="px-2 text-white font-bold font-mono text-sm w-16 text-center">
            {Math.round(scale * 100)}%
          </div>
          <button
            onClick={() => setScale(prev => Math.min(5, prev + 0.2))}
            className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors"
            title="放大"
          >
            <ZoomIn size={20} />
          </button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button
            onClick={handleCopy}
            className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-2"
            title="复制图片"
          >
            {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors"
            title="下载图片"
          >
            <Download size={20} />
          </button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button
            onClick={onClose}
            className="p-2 text-red-400 hover:bg-red-900/40 rounded-xl transition-colors"
            title="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* Image Container */}
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <motion.div
            style={{
              x: position.x,
              y: position.y,
              scale: scale,
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <img
              src={imageUrl}
              alt={prompt || 'Generated image'}
              className="max-w-[90vw] max-h-[80vh] object-contain shadow-2xl rounded-lg select-none"
              draggable={false}
            />
          </motion.div>
        </div>

        {/* Prompt Info */}
        {prompt && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-white/10 backdrop-blur-xl p-4 rounded-2xl border border-white/10 text-white text-center">
            <p className="text-sm opacity-80 line-clamp-3">{prompt}</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
