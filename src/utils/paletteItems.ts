import Fuse from "fuse.js";

import type { PaletteItem } from "../types/palette";

/**
 * Items rank by `relevance + matchScore`, where `matchScore` is the fuzzy match
 * normalised to 0–100. Giving an item this relevance therefore floats it above
 * every plain match, so reserve it for items pinned to the current context.
 */
export const PINNED_PALETTE_RELEVANCE = 100;

/**
 * Indexing is the expensive part and depends only on `items`, so callers build
 * the search once per item list and reuse it across keystrokes. The index
 * itself is deferred until a query actually needs it.
 */
export function createPaletteSearch(
  items: PaletteItem[],
): (query: string) => PaletteItem[] {
  // Opening the palette lists every item unfiltered, and indexing thousands of
  // database objects just to render that list is waste.
  let fuse: Fuse<PaletteItem> | undefined;
  const searchIndex = () =>
    (fuse ??= new Fuse(items, {
      keys: [
        { name: "title", weight: 0.55 },
        { name: "keywords", weight: 0.2 },
        { name: "description", weight: 0.1 },
        { name: "group", weight: 0.1 },
        { name: "badge", weight: 0.05 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    }));

  return (query) => {
    const trimmedQuery = query.trim();
    const matches = trimmedQuery
      ? searchIndex()
          .search(trimmedQuery)
          .map(({ item, score }, index) => ({
          item,
          index,
          matchScore: Math.round((1 - (score ?? 1)) * 100),
        }))
      : items.map((item, index) => ({ item, index, matchScore: 0 }));

    return matches
      .sort(
        (left, right) =>
          (right.item.relevance ?? 0) +
            right.matchScore -
            ((left.item.relevance ?? 0) + left.matchScore) ||
          left.index - right.index,
      )
      .map(({ item }) => item);
  };
}
