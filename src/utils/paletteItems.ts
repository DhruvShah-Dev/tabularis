import Fuse from "fuse.js";

import type { PaletteItem } from "../types/palette";

export function resolvePaletteItems(
  items: PaletteItem[],
  query: string,
): PaletteItem[] {
  const trimmedQuery = query.trim();
  const matches = trimmedQuery
    ? new Fuse(items, {
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
      })
        .search(trimmedQuery)
        .map(({ item, score }) => ({
          item,
          matchScore: Math.round((1 - (score ?? 1)) * 100),
        }))
    : items.map((item) => ({ item, matchScore: 0 }));

  return matches
    .sort(
      (left, right) =>
        (right.item.relevance ?? 0) +
          right.matchScore -
          ((left.item.relevance ?? 0) + left.matchScore) ||
        left.item.title.localeCompare(right.item.title) ||
        left.item.id.localeCompare(right.item.id),
    )
    .map(({ item }) => item);
}
