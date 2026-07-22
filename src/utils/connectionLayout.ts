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

/** Minimum share (in %) a split pane can be resized down to */
export const MIN_SPLIT_PANE_SIZE = 10;

/** Returns equal percentage shares for the given number of panes */
export function defaultSplitSizes(paneCount: number): number[] {
  return Array.from({ length: paneCount }, () => 100 / paneCount);
}

/**
 * Returns new pane shares after dragging the divider between pane
 * `dividerIndex` and the next one by `deltaPercent`. Only the two panes
 * adjacent to the divider change; both are clamped to MIN_SPLIT_PANE_SIZE.
 */
export function resizeSplitSizes(
  sizes: number[],
  dividerIndex: number,
  deltaPercent: number,
): number[] {
  if (dividerIndex < 0 || dividerIndex >= sizes.length - 1) return sizes;
  const left = sizes[dividerIndex];
  const right = sizes[dividerIndex + 1];
  const clampedDelta = Math.max(
    MIN_SPLIT_PANE_SIZE - left,
    Math.min(deltaPercent, right - MIN_SPLIT_PANE_SIZE),
  );
  if (clampedDelta === 0) return sizes;
  const next = [...sizes];
  next[dividerIndex] = left + clampedDelta;
  next[dividerIndex + 1] = right - clampedDelta;
  return next;
}

/** Edge of a split pane a dragged panel can be dropped on */
export type SplitEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * Returns a new split view with the dragged panel placed on the given edge of
 * the target panel: left/right edges arrange panes side by side (vertical
 * mode), top/bottom edges stack them (horizontal mode).
 */
export function moveInSplit(
  splitView: SplitView,
  draggedId: string,
  targetId: string,
  edge: SplitEdge,
): SplitView {
  const ids = splitView.connectionIds;
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) {
    return splitView;
  }
  const mode = edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal';
  const without = ids.filter(id => id !== draggedId);
  const targetIdx = without.indexOf(targetId);
  const insertIdx = edge === 'left' || edge === 'top' ? targetIdx : targetIdx + 1;
  without.splice(insertIdx, 0, draggedId);
  return { ...splitView, mode, connectionIds: without };
}

/** Returns the pane edge closest to the pointer position */
export function getPanelDropEdge(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): SplitEdge {
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  const distances: Array<[SplitEdge, number]> = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y],
  ];
  return distances.reduce((closest, candidate) =>
    candidate[1] < closest[1] ? candidate : closest,
  )[0];
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
