import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Unlink, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConnectionLayoutContext } from '../../../hooks/useConnectionLayoutContext';
import { useDatabase } from '../../../hooks/useDatabase';
import { useDrivers } from '../../../hooks/useDrivers';
import { getConnectionAccent, getConnectionIcon } from '../../../utils/driverUI';
import { ContextMenu } from '../../ui/ContextMenu';
import { RailIndicator } from './RailIndicator';
import type { ConnectionStatus } from '../../../hooks/useConnectionManager';

interface Props {
  connections: ConnectionStatus[];
  mode: 'vertical' | 'horizontal';
}

export const ConnectionGroupItem = ({ connections, mode }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    splitView,
    deactivateSplit,
    showSplitView,
    isSplitVisible,
    removeConnectionFromSplit,
    reorderSplitConnections,
    addConnectionToSplit,
  } = useConnectionLayoutContext();
  const { connections: savedConnections } = useDatabase();
  const { allDrivers } = useDrivers();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; connectionId?: string } | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);

  // Render panes in split order, not sidebar order
  const orderedConnections = splitView
    ? splitView.connectionIds
        .map(id => connections.find(c => c.id === id))
        .filter((c): c is ConnectionStatus => !!c)
    : connections;

  const handleGroupContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleIconContextMenu = (connectionId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, connectionId });
  };

  const menuItems = contextMenu?.connectionId
    ? [
        {
          label: t('sidebar.removeFromSplitGroup'),
          icon: X,
          action: () => removeConnectionFromSplit(contextMenu.connectionId!),
        },
        {
          label: t('sidebar.separateConnections'),
          icon: Unlink,
          action: deactivateSplit,
        },
      ]
    : [
        {
          label: t('sidebar.separateConnections'),
          icon: Unlink,
          action: deactivateSplit,
        },
      ];

  const handleDragOver = (e: React.DragEvent) => {
    // Accept both in-group reorders and connections dragged from the rail
    e.preventDefault();
    setIsDropTarget(true);
  };

  const handleDrop = (targetId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || !splitView) return;
    if (splitView.connectionIds.includes(draggedId)) {
      if (targetId) reorderSplitConnections(draggedId, targetId);
    } else {
      addConnectionToSplit(draggedId);
    }
  };

  return (
    <>
      <div className="relative group w-full flex justify-center mb-1">
        <RailIndicator isActive={isSplitVisible && location.pathname === "/editor"} />
        {/* A div instead of a button: draggable children inside a <button>
            don't emit drag events reliably (notably on WebKitGTK) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => { showSplitView(); navigate('/editor'); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { showSplitView(); navigate('/editor'); }
          }}
          onContextMenu={handleGroupContextMenu}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDropTarget(false)}
          onDrop={(e) => handleDrop(null, e)}
          className={`grid grid-cols-2 gap-0.5 p-1 rounded-xl transition-all relative cursor-pointer bg-surface-secondary ${
            isDropTarget ? 'ring-2 ring-blue-400' : 'ring-1 ring-default'
          }`}
          title={orderedConnections.map(c => c.name).join(' / ')}
        >
          {orderedConnections.map(conn => {
            const saved = savedConnections.find(c => c.id === conn.id);
            const manifest = allDrivers.find(d => d.id === conn.driver);
            return (
              <div
                key={conn.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', conn.id);
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(conn.id, e)}
                onContextMenu={(e) => handleIconContextMenu(conn.id, e)}
                className="w-5 h-5 rounded flex items-center justify-center text-white cursor-grab active:cursor-grabbing"
                style={{ backgroundColor: getConnectionAccent(saved, manifest) }}
                title={conn.name}
              >
                {getConnectionIcon(saved, manifest, 12)}
              </div>
            );
          })}

          {/* Split mode badge */}
          <div className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold bg-purple-600 text-white rounded px-0.5 leading-tight">
            {mode === 'vertical' ? '⇔' : '⇕'}
          </div>
        </div>

        {/* Tooltip */}
        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface-secondary text-primary text-xs px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none shadow-lg border border-default">
          <div className="font-medium">{t('sidebar.splitGroup')}</div>
          {orderedConnections.map(c => (
            <div key={c.id} className="text-muted text-[10px]">
              {c.name}
            </div>
          ))}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};
