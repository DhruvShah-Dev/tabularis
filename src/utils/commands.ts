import Fuse from "fuse.js";

import type {
  CommandDefinition,
  CommandResult,
  ResolveCommandsOptions,
} from "../types/commands";

export function resolveCommands(
  commands: CommandDefinition[],
  options: ResolveCommandsOptions,
): CommandResult[] {
  const eligible = commands.filter(
      (command) =>
        !command.isAvailable || command.isAvailable(options.context),
    );

  const trimmedQuery = options.query.trim();
  const matches = trimmedQuery
    ? new Fuse(eligible, {
        keys: [
          { name: "title", weight: 0.65 },
          { name: "keywords", weight: 0.25 },
          { name: "description", weight: 0.1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
      })
        .search(trimmedQuery)
        .map(({ item, score }) => ({
          command: item,
          matchScore: Math.round((1 - (score ?? 1)) * 100),
        }))
    : eligible.map((command) => ({ command, matchScore: 0 }));

  return matches
    .map(({ command, matchScore }) => ({
      command,
      score:
        matchScore + (command.getRelevance?.(options.context) ?? 0),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.command.title.localeCompare(right.command.title) ||
        left.command.id.localeCompare(right.command.id),
    );
}
