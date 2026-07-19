import { describe, expect, it, vi } from "vitest";

import type {
  CommandContext,
  CommandDefinition,
} from "../../src/types/commands";
import {
  addCommand,
  removeCommand,
  resolveCommands,
} from "../../src/utils/commands";

const tableContext: CommandContext = {
  surface: "table",
  connectionId: "connection-1",
  driver: "postgres",
  database: "app",
  schema: "public",
  resource: {
    type: "table",
    connectionId: "connection-1",
    tableName: "users",
    database: "app",
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
    modes: ["actions"],
    execute: vi.fn(),
    ...overrides,
  };
}

describe("commands", () => {
  describe("addCommand", () => {
    it("should reject a duplicate command id", () => {
      const command = createCommand();

      expect(() => addCommand([command], createCommand())).toThrow(
        'Command "test.command" is already registered',
      );
    });
  });

  describe("removeCommand", () => {
    it("should be idempotent when the command is already absent", () => {
      const commands = [createCommand()];

      const once = removeCommand(commands, "test.command");
      const twice = removeCommand(once, "test.command");

      expect(once).toEqual([]);
      expect(twice).toEqual([]);
    });
  });

  describe("resolveCommands", () => {
    it("should filter commands by mode and availability", () => {
      const results = resolveCommands(
        [
          createCommand({ id: "available" }),
          createCommand({ id: "objects", modes: ["objects"] }),
          createCommand({
            id: "unavailable",
            isAvailable: () => false,
          }),
        ],
        { mode: "actions", query: "", context: tableContext },
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
        { mode: "actions", query: "open", context: tableContext },
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
        { mode: "actions", query: "preferenses", context: tableContext },
      );

      expect(results.map((result) => result.command.id)).toEqual([
        "settings",
      ]);
    });
  });
});
