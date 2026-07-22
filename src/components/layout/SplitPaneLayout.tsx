import { useRef, useState, Fragment } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { PanelDatabaseProvider } from './PanelDatabaseProvider';
import { EditorProvider } from '../../contexts/EditorProvider';
import { Editor } from '../../pages/Editor';
import { useSplitPaneResize } from '../../hooks/useSplitPaneResize';
import { useConnectionLayoutContext } from '../../hooks/useConnectionLayoutContext';
import { useDatabase } from '../../hooks/useDatabase';
import { useDrivers } from '../../hooks/useDrivers';
import { getConnectionAccent } from '../../utils/driverUI';
import { getPanelDropEdge } from '../../utils/connectionLayout';
import type { SplitEdge, SplitView } from '../../utils/connectionLayout';
import { rectContains, startPointerDrag } from '../../utils/pointerDrag';

const EDGE_OVERLAY_CLASS: Record<SplitEdge, string> = {
  left: 'left-0 top-0 bottom-0 w-1/2',
  right: 'right-0 top-0 bottom-0 w-1/2',
  top: 'top-0 left-0 right-0 h-1/2',
  bottom: 'bottom-0 left-0 right-0 h-1/2',
};

export const SplitPaneLayout = ({ connectionIds, mode }: SplitView) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { sizes, startResize } = useSplitPaneResize(mode, containerRef, connectionIds.length);
  const isVertical = mode === 'vertical';
  const { deactivateSplit, removeConnectionFromSplit, moveSplitConnection, explorerConnectionId, setExplorerConnectionId } = useConnectionLayoutContext();
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ connId: string; edge: SplitEdge } | null>(null);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const dropTargetRef = useRef<{ connId: string; edge: SplitEdge } | null>(null);

  // Pointer-based panel move (mousedown + tracking): HTML5 drag-and-drop can
  // freeze the WebKitGTK compositor, and live tracking feels Hyprland-like
  const startPanelMove = (connId: string, connName: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startPointerDrag(e.clientX, e.clientY, {
      createGhost: () => {
        const ghost = document.createElement('div');
        ghost.className = 'px-2 py-1 rounded text-xs bg-surface-secondary text-primary border border-default shadow-lg';
        ghost.textContent = connName;
        return ghost;
      },
      onDragStart: () => setDraggedPanelId(connId),
      onDragMove: (x, y) => {
        let found: { connId: string; edge: SplitEdge } | null = null;
        for (const [id, el] of panelRefs.current) {
          if (id === connId) continue;
          const rect = el.getBoundingClientRect();
          if (rectContains(rect, x, y)) {
            found = { connId: id, edge: getPanelDropEdge(rect, x, y) };
            break;
          }
        }
        dropTargetRef.current = found;
        setDropTarget(prev =>
          prev?.connId === found?.connId && prev?.edge === found?.edge ? prev : found,
        );
      },
      onDrop: () => {
        const target = dropTargetRef.current;
        if (target) moveSplitConnection(connId, target.connId, target.edge);
      },
      onEnd: () => {
        dropTargetRef.current = null;
        setDraggedPanelId(null);
        setDropTarget(null);
      },
    });
  };
  const { switchConnection, connectionDataMap, connections } = useDatabase();
  const { allDrivers } = useDrivers();
  const { t } = useTranslation();

  // Each panel header carries its own connection's accent color (matching the
  // tinted editor tab bar inside the panel), with the active panel rendered
  // more strongly so it still stands out from the others.
  const accentFor = (connId: string) => {
    const conn = connections.find((c) => c.id === connId);
    const driverId = conn?.params.driver ?? connectionDataMap[connId]?.driver;
    return getConnectionAccent(conn, allDrivers.find((d) => d.id === driverId));
  };

  const handleClosePanel = (connId: string) => {
    const remaining = connectionIds.filter(id => id !== connId);
    if (remaining.length < 2) {
      deactivateSplit();
      if (remaining.length === 1) switchConnection(remaining[0]);
    } else {
      removeConnectionFromSplit(connId);
      if (explorerConnectionId === connId) {
        setExplorerConnectionId(remaining[0]);
      }
    }
  };

  // Panels are rendered in a stable order and arranged visually with the
  // flexbox `order` property: reordering keyed children would move their DOM
  // nodes, and Monaco crashes when its container gets reparented mid-render.
  // Panels take even order slots, dividers the odd ones in between.
  const stableIds = [...connectionIds].sort();

  return (
    <div
      ref={containerRef}
      className={clsx('flex h-full w-full', isVertical ? 'flex-row' : 'flex-col')}
    >
      {stableIds.map((connId) => {
        const visualIndex = connectionIds.indexOf(connId);
        const accent = accentFor(connId);
        const isActivePanel = explorerConnectionId === connId;
        const isDropCandidate = !!draggedPanelId && draggedPanelId !== connId;
        return (
        <Fragment key={connId}>
          <div
            ref={(el) => {
              if (el) panelRefs.current.set(connId, el);
              else panelRefs.current.delete(connId);
            }}
            className="relative flex flex-col min-w-0 min-h-0"
            onClickCapture={() => {
              if (explorerConnectionId !== connId) setExplorerConnectionId(connId);
            }}
            style={{
              order: visualIndex * 2,
              flexGrow: sizes[visualIndex] ?? 1,
              flexBasis: 0,
              flexShrink: 0,
            }}
          >
            {/* Drop-zone highlight while dragging a panel over this one */}
            {isDropCandidate && dropTarget?.connId === connId && (
              <div
                className={clsx(
                  'absolute z-20 pointer-events-none bg-blue-500/20 border-2 border-blue-400/60 rounded-sm',
                  EDGE_OVERLAY_CLASS[dropTarget.edge],
                )}
              />
            )}
            {/* Panel header — same accent wash as the editor tab bar below,
                with the connection's accent color for the title text. */}
            <div
              className="flex items-center justify-between h-7 px-3 border-b shrink-0 transition-colors"
              style={{
                backgroundImage: isActivePanel
                  ? `linear-gradient(${accent}30, ${accent}20)`
                  : `linear-gradient(${accent}18, ${accent}10)`,
                borderBottomColor: `${accent}${isActivePanel ? '50' : '26'}`,
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  onMouseDown={(e) => startPanelMove(connId, connectionDataMap[connId]?.connectionName ?? connId, e)}
                  className="shrink-0 cursor-grab active:cursor-grabbing text-muted hover:text-primary"
                  title={t('sidebar.movePanel')}
                >
                  <GripHorizontal size={12} />
                </div>
                <span
                  className="text-xs truncate transition-colors"
                  style={{ color: `${accent}${isActivePanel ? 'ff' : 'b3'}` }}
                >
                  {connectionDataMap[connId]?.connectionName ?? connId}
                </span>
              </div>
              <button
                onClick={() => handleClosePanel(connId)}
                className="ml-2 p-0.5 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors shrink-0"
                title={t('sidebar.closePanel')}
              >
                <X size={12} />
              </button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden min-h-0">
              <PanelDatabaseProvider connectionId={connId}>
                <EditorProvider>
                  <Editor />
                </EditorProvider>
              </PanelDatabaseProvider>
            </div>
          </div>
        </Fragment>
        );
      })}

      {Array.from({ length: connectionIds.length - 1 }, (_, k) => (
        <div
          key={`divider-${k}`}
          onMouseDown={(e) => startResize(k, e)}
          style={{ order: k * 2 + 1 }}
          className={clsx(
            'bg-default hover:bg-blue-500/50 transition-colors shrink-0 z-10',
            isVertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
          )}
        />
      ))}
    </div>
  );
};
