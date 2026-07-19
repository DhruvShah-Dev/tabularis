import { describe, expect, it, vi } from "vitest";

import type {
  CommandContext,
  CommandDefinition,
} from "../../src/types/commands";
import { resolveCommands } from "../../src/utils/commands";

const tableContext: CommandContext = {
  resource: {
    type: "table",
    tableName: "users",
    schema: "public",
  },
};

function createCommand(
  overrides: Partial<CommandDefinition> = {},
): CommandDefinition {
  return {
    id: "test.command",
    title: "Test command",
    category: "general",
    execute: vi.fn(),
    ...overrides,
  };
}

describe("commands", () => {
  describe("resolveCommands", () => {
    it("should filter unavailable commands", () => {
      const results = resolveCommands(
        [
          createCommand({ id: "available" }),
          createCommand({
            id: "unavailable",
            isAvailable: () => false,
          }),
        ],
        { query: "", context: tableContext },
      );

      expect(results.map((result) => result.command.id)).toEqual([
        "available",
      ]);
    });

    it("should rank contextually relevant commands first", () => {
      const results = resolveCommands(
        [
          createCommand({ id: "global", title: "Open console" }),
          createCommand({
            id: "table",
            title: "Open table in console",
            getRelevance: (context) =>
              context.resource.type === "table" ? 100 : 0,
          }),
        ],
        { query: "open", context: tableContext },
      );

      expect(results.map((result) => result.command.id)).toEqual([
        "table",
        "global",
      ]);
    });

    it("should find commands by fuzzy keyword matches", () => {
      const results = resolveCommands(
        [
          createCommand({
            id: "settings",
            title: "Open settings",
            keywords: ["preferences", "configuration"],
          }),
          createCommand({ id: "console", title: "New SQL console" }),
        ],
        { query: "preferenses", context: tableContext },
      );

      expect(results.map((result) => result.command.id)).toEqual([
        "settings",
      ]);
    });
  });
});
