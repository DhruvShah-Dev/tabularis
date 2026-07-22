import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { defaultSplitSizes, resizeSplitSizes } from '../utils/connectionLayout';

const STORAGE_KEY = 'tabularis_split_pane_sizes';

function loadSizes(paneCount: number): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const sizes = saved[paneCount];
    if (Array.isArray(sizes) && sizes.length === paneCount && sizes.every(s => typeof s === 'number')) {
      return sizes;
    }
  } catch {
    // Corrupt storage falls through to the default
  }
  return defaultSplitSizes(paneCount);
}

/**
 * Resizable shares for an N-pane split. Sizes are percentages summing to 100,
 * meant to be used as flex-grow factors; each divider drags independently.
 * Shares are persisted per pane count.
 */
export const useSplitPaneResize = (
  mode: 'vertical' | 'horizontal',
  containerRef: RefObject<HTMLDivElement | null>,
  paneCount: number,
) => {
  const [sizes, setSizes] = useState<number[]>(() => loadSizes(paneCount));
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  useEffect(() => {
    setSizes(loadSizes(paneCount));
  }, [paneCount]);

  const startResize = useCallback(
    (dividerIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      const cursorStyle = mode === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.cursor = cursorStyle;

      // Overlay prevents editors from capturing mouse events during drag
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${cursorStyle}`;
      document.body.appendChild(overlay);

      const startPos = mode === 'vertical' ? e.clientX : e.clientY;
      const startSizes = sizesRef.current;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const containerSize = mode === 'vertical' ? rect.width : rect.height;
        if (containerSize === 0) return;
        const currentPos = mode === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
        const deltaPercent = ((currentPos - startPos) / containerSize) * 100;
        setSizes(resizeSplitSizes(startSizes, dividerIndex, deltaPercent));
      };

      const handleMouseUp = () => {
        document.body.style.cursor = 'default';
        overlay.remove();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [mode, containerRef],
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      saved[sizes.length] = sizes;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ [sizes.length]: sizes }));
    }
  }, [sizes]);

  return { sizes, startResize };
};
