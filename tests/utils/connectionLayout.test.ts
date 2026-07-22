import { describe, it, expect } from 'vitest';
import {
  isConnectionGrouped,
  buildSplitContainerClass,
  buildPanelDatabaseData,
  canActivateSplit,
  canAddToSplit,
  addToSplit,
  reorderSplit,
  defaultSplitSizes,
  resizeSplitSizes,
  moveInSplit,
  getPanelDropEdge,
  MAX_SPLIT_CONNECTIONS,
  MIN_SPLIT_PANE_SIZE,
  type SplitView,
} from '../../src/utils/connectionLayout';
import type { ConnectionData } from '../../src/contexts/DatabaseContext';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeSplitView = (overrides?: Partial<SplitView>): SplitView => ({
  connectionIds: ['conn-a', 'conn-b'],
  mode: 'vertical',
  ...overrides,
});

const makeConnectionData = (overrides?: Partial<ConnectionData>): ConnectionData => ({
  driver: 'postgres',
  connectionName: 'Test DB',
  databaseName: 'mydb',
  tables: [],
  views: [],
  routines: [],
  isLoadingTables: false,
  isLoadingViews: false,
  isLoadingRoutines: false,
  schemas: [],
  isLoadingSchemas: false,
  schemaDataMap: {},
  activeSchema: null,
  selectedSchemas: [],
  needsSchemaSelection: false,
  isConnecting: false,
  isConnected: true,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('connectionLayout', () => {
  describe('isConnectionGrouped', () => {
    it('returns false when splitView is null', () => {
      expect(isConnectionGrouped('conn-a', null)).toBe(false);
    });

    it('returns true when connectionId is in the split view', () => {
      const splitView = makeSplitView({ connectionIds: ['conn-a', 'conn-b'] });
      expect(isConnectionGrouped('conn-a', splitView)).toBe(true);
      expect(isConnectionGrouped('conn-b', splitView)).toBe(true);
    });

    it('returns false when connectionId is not in the split view', () => {
      const splitView = makeSplitView({ connectionIds: ['conn-a', 'conn-b'] });
      expect(isConnectionGrouped('conn-c', splitView)).toBe(false);
    });

    it('returns false for empty connectionIds array', () => {
      const splitView = makeSplitView({ connectionIds: [] });
      expect(isConnectionGrouped('conn-a', splitView)).toBe(false);
    });
  });

  describe('buildSplitContainerClass', () => {
    it('returns flex-row class for vertical mode', () => {
      const result = buildSplitContainerClass('vertical');
      expect(result).toContain('flex-row');
      expect(result).toContain('flex');
      expect(result).toContain('h-full');
      expect(result).toContain('w-full');
    });

    it('returns flex-col class for horizontal mode', () => {
      const result = buildSplitContainerClass('horizontal');
      expect(result).toContain('flex-col');
      expect(result).toContain('flex');
      expect(result).toContain('h-full');
      expect(result).toContain('w-full');
    });

    it('vertical and horizontal return different classes', () => {
      expect(buildSplitContainerClass('vertical')).not.toBe(
        buildSplitContainerClass('horizontal'),
      );
    });
  });

  describe('buildPanelDatabaseData', () => {
    it('returns connection data for a known connectionId', () => {
      const data = makeConnectionData({ driver: 'mysql' });
      const map = { 'conn-a': data };
      expect(buildPanelDatabaseData('conn-a', map)).toBe(data);
    });

    it('returns undefined for unknown connectionId', () => {
      const map = { 'conn-a': makeConnectionData() };
      expect(buildPanelDatabaseData('conn-unknown', map)).toBeUndefined();
    });

    it('returns undefined for empty map', () => {
      expect(buildPanelDatabaseData('conn-a', {})).toBeUndefined();
    });

    it('returns correct entry from multi-entry map', () => {
      const dataA = makeConnectionData({ driver: 'postgres' });
      const dataB = makeConnectionData({ driver: 'mysql' });
      const map = { 'conn-a': dataA, 'conn-b': dataB };
      expect(buildPanelDatabaseData('conn-b', map)).toBe(dataB);
    });
  });

  describe('canActivateSplit', () => {
    it('returns false for empty set', () => {
      expect(canActivateSplit(new Set())).toBe(false);
    });

    it('returns false for single connection', () => {
      expect(canActivateSplit(new Set(['conn-a']))).toBe(false);
    });

    it('returns true for exactly 2 connections', () => {
      expect(canActivateSplit(new Set(['conn-a', 'conn-b']))).toBe(true);
    });

    it('returns true for 3 or more connections', () => {
      expect(canActivateSplit(new Set(['conn-a', 'conn-b', 'conn-c']))).toBe(true);
    });

    it('returns true for exactly MAX_SPLIT_CONNECTIONS connections', () => {
      expect(canActivateSplit(new Set(['a', 'b', 'c', 'd']))).toBe(true);
    });

    it('returns false beyond MAX_SPLIT_CONNECTIONS', () => {
      expect(canActivateSplit(new Set(['a', 'b', 'c', 'd', 'e']))).toBe(false);
    });
  });

  describe('canAddToSplit', () => {
    it('returns false when there is no split view', () => {
      expect(canAddToSplit(null, 'conn-c')).toBe(false);
    });

    it('returns true for a new connection when the group has room', () => {
      expect(canAddToSplit(makeSplitView(), 'conn-c')).toBe(true);
    });

    it('returns false for a connection already in the group', () => {
      expect(canAddToSplit(makeSplitView(), 'conn-a')).toBe(false);
    });

    it('returns false when the group is full', () => {
      const full = makeSplitView({ connectionIds: ['a', 'b', 'c', 'd'] });
      expect(full.connectionIds).toHaveLength(MAX_SPLIT_CONNECTIONS);
      expect(canAddToSplit(full, 'conn-e')).toBe(false);
    });
  });

  describe('addToSplit', () => {
    it('appends the connection at the end', () => {
      const result = addToSplit(makeSplitView(), 'conn-c');
      expect(result.connectionIds).toEqual(['conn-a', 'conn-b', 'conn-c']);
    });

    it('preserves the split mode', () => {
      const result = addToSplit(makeSplitView({ mode: 'horizontal' }), 'conn-c');
      expect(result.mode).toBe('horizontal');
    });

    it('returns the original view when the connection is already grouped', () => {
      const view = makeSplitView();
      expect(addToSplit(view, 'conn-a')).toBe(view);
    });

    it('returns the original view when the group is full', () => {
      const full = makeSplitView({ connectionIds: ['a', 'b', 'c', 'd'] });
      expect(addToSplit(full, 'conn-e')).toBe(full);
    });
  });

  describe('reorderSplit', () => {
    const view = makeSplitView({ connectionIds: ['a', 'b', 'c', 'd'] });

    it('moves a connection forward to the target position', () => {
      expect(reorderSplit(view, 'a', 'c').connectionIds).toEqual(['b', 'c', 'a', 'd']);
    });

    it('moves a connection backward to the target position', () => {
      expect(reorderSplit(view, 'd', 'b').connectionIds).toEqual(['a', 'd', 'b', 'c']);
    });

    it('swaps adjacent connections', () => {
      expect(reorderSplit(view, 'a', 'b').connectionIds).toEqual(['b', 'a', 'c', 'd']);
      expect(reorderSplit(view, 'b', 'a').connectionIds).toEqual(['b', 'a', 'c', 'd']);
    });

    it('returns the original view when dragged and target are the same', () => {
      expect(reorderSplit(view, 'a', 'a')).toBe(view);
    });

    it('returns the original view when either id is not in the group', () => {
      expect(reorderSplit(view, 'x', 'a')).toBe(view);
      expect(reorderSplit(view, 'a', 'x')).toBe(view);
    });
  });

  describe('defaultSplitSizes', () => {
    it('returns equal shares summing to 100', () => {
      expect(defaultSplitSizes(2)).toEqual([50, 50]);
      expect(defaultSplitSizes(4)).toEqual([25, 25, 25, 25]);
      const three = defaultSplitSizes(3);
      expect(three).toHaveLength(3);
      expect(three.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    });
  });

  describe('resizeSplitSizes', () => {
    it('moves share between the two panes around the divider', () => {
      expect(resizeSplitSizes([50, 50], 0, 10)).toEqual([60, 40]);
      expect(resizeSplitSizes([25, 25, 25, 25], 1, -5)).toEqual([25, 20, 30, 25]);
    });

    it('leaves panes not adjacent to the divider untouched', () => {
      const result = resizeSplitSizes([25, 25, 25, 25], 2, 10);
      expect(result[0]).toBe(25);
      expect(result[1]).toBe(25);
    });

    it('keeps the total share constant', () => {
      const result = resizeSplitSizes([40, 30, 30], 0, 17);
      expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    });

    it('clamps both panes to the minimum size', () => {
      expect(resizeSplitSizes([50, 50], 0, 60)).toEqual([100 - MIN_SPLIT_PANE_SIZE, MIN_SPLIT_PANE_SIZE]);
      expect(resizeSplitSizes([50, 50], 0, -60)).toEqual([MIN_SPLIT_PANE_SIZE, 100 - MIN_SPLIT_PANE_SIZE]);
    });

    it('returns the original array when the delta is fully clamped away', () => {
      const sizes = [MIN_SPLIT_PANE_SIZE, 100 - MIN_SPLIT_PANE_SIZE];
      expect(resizeSplitSizes(sizes, 0, -5)).toBe(sizes);
    });

    it('ignores out-of-range divider indices', () => {
      const sizes = [50, 50];
      expect(resizeSplitSizes(sizes, -1, 10)).toBe(sizes);
      expect(resizeSplitSizes(sizes, 1, 10)).toBe(sizes);
    });
  });

  describe('moveInSplit', () => {
    const view = makeSplitView({ connectionIds: ['a', 'b', 'c'], mode: 'vertical' });

    it('places the panel before the target on a left drop and keeps vertical mode', () => {
      const result = moveInSplit(view, 'c', 'a', 'left');
      expect(result.connectionIds).toEqual(['c', 'a', 'b']);
      expect(result.mode).toBe('vertical');
    });

    it('places the panel after the target on a right drop', () => {
      const result = moveInSplit(view, 'a', 'b', 'right');
      expect(result.connectionIds).toEqual(['b', 'a', 'c']);
      expect(result.mode).toBe('vertical');
    });

    it('switches to horizontal mode on a top drop', () => {
      const result = moveInSplit(view, 'c', 'b', 'top');
      expect(result.connectionIds).toEqual(['a', 'c', 'b']);
      expect(result.mode).toBe('horizontal');
    });

    it('switches to horizontal mode on a bottom drop', () => {
      const result = moveInSplit(view, 'a', 'c', 'bottom');
      expect(result.connectionIds).toEqual(['b', 'c', 'a']);
      expect(result.mode).toBe('horizontal');
    });

    it('switches back to vertical mode on a side drop from horizontal', () => {
      const horizontal = makeSplitView({ connectionIds: ['a', 'b'], mode: 'horizontal' });
      expect(moveInSplit(horizontal, 'b', 'a', 'left').mode).toBe('vertical');
    });

    it('returns the original view for self-drops or unknown ids', () => {
      expect(moveInSplit(view, 'a', 'a', 'left')).toBe(view);
      expect(moveInSplit(view, 'x', 'a', 'left')).toBe(view);
      expect(moveInSplit(view, 'a', 'x', 'left')).toBe(view);
    });
  });

  describe('getPanelDropEdge', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };

    it('returns the edge closest to the pointer', () => {
      expect(getPanelDropEdge(rect, 10, 50)).toBe('left');
      expect(getPanelDropEdge(rect, 90, 50)).toBe('right');
      expect(getPanelDropEdge(rect, 50, 10)).toBe('top');
      expect(getPanelDropEdge(rect, 50, 90)).toBe('bottom');
    });

    it('accounts for the rect offset', () => {
      const offset = { left: 200, top: 100, width: 100, height: 100 };
      expect(getPanelDropEdge(offset, 210, 150)).toBe('left');
      expect(getPanelDropEdge(offset, 250, 190)).toBe('bottom');
    });

    it('handles degenerate rects without dividing by zero', () => {
      expect(() => getPanelDropEdge({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).not.toThrow();
    });
  });
});
