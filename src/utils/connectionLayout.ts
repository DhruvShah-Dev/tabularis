import type { ConnectionData } from '../contexts/DatabaseContext';

export interface SplitView {
  connectionIds: string[];
  mode: 'vertical' | 'horizontal';
}

/** Returns true if the connection belongs to the active split view */
export function isConnectionGrouped(connectionId: string, splitView: SplitView | null): boolean {
  if (!splitView) return false;
  return splitView.connectionIds.includes(connectionId);
}

/** Returns the flex container class for the given split mode */
export function buildSplitContainerClass(mode: 'vertical' | 'horizontal'): string {
  return mode === 'vertical'
    ? 'flex flex-row h-full w-full'
    : 'flex flex-col h-full w-full';
}

/** Returns the connection data for a specific connectionId from the map */
export function buildPanelDatabaseData(
  connectionId: string,
  connectionDataMap: Record<string, ConnectionData>,
): ConnectionData | undefined {
  return connectionDataMap[connectionId];
}

/** Maximum number of connections a split group can hold */
export const MAX_SPLIT_CONNECTIONS = 4;

/** Returns true if between 2 and MAX_SPLIT_CONNECTIONS connections are selected */
export function canActivateSplit(selectedIds: Set<string>): boolean {
  return selectedIds.size >= 2 && selectedIds.size <= MAX_SPLIT_CONNECTIONS;
}

/** Returns true if the connection can be added to the current split group */
export function canAddToSplit(splitView: SplitView | null, connectionId: string): boolean {
  if (!splitView) return false;
  return (
    splitView.connectionIds.length < MAX_SPLIT_CONNECTIONS &&
    !splitView.connectionIds.includes(connectionId)
  );
}

/** Returns a new split view with the connection appended, or the original if it can't be added */
export function addToSplit(splitView: SplitView, connectionId: string): SplitView {
  if (!canAddToSplit(splitView, connectionId)) return splitView;
  return { ...splitView, connectionIds: [...splitView.connectionIds, connectionId] };
}

/** Returns a new split view with the dragged connection moved to the target's position */
export function reorderSplit(
  splitView: SplitView,
  draggedId: string,
  targetId: string,
): SplitView {
  if (draggedId === targetId) return splitView;
  const ids = splitView.connectionIds;
  if (!ids.includes(draggedId) || !ids.includes(targetId)) return splitView;
  const without = ids.filter(id => id !== draggedId);
  const targetIdx = without.indexOf(targetId);
  const draggedWasBefore = ids.indexOf(draggedId) < ids.indexOf(targetId);
  // Dragging forward lands after the target, dragging backward lands before it
  without.splice(draggedWasBefore ? targetIdx + 1 : targetIdx, 0, draggedId);
  return { ...splitView, connectionIds: without };
}
