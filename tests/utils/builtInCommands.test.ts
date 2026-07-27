import { describe, expect, it, vi } from "vitest";

import { createBuiltInCommandItems } from "../../src/utils/builtInCommands";
import type { CommandScope } from "../../src/types/commands";

const labels = {
  openSettings: "Open settings",
  openTableInConsole: "Open table in console",
  navigationCategory: "Navigation",
  tableCategory: "Table",
};

describe("createBuiltInCommandItems", () => {
  it("should return commands already bound to their scope", async () => {
    const navigate = vi.fn();
    const openEditor = vi.fn();
    const scope: CommandScope = {
      connectionId: "connection-b",
      driver: "postgres",
      table: {
        connectionId: "connection-b",
        tableName: "orders",
        schema: "sales",
      },
      runtime: {
        navigate,
        openEditor,
      },
    };

    const items = createBuiltInCommandItems(scope, labels);

    expect(items).toHaveLength(2);
    expect(items[1].description).toBe("orders");
    await items[1].primaryAction.execute();
    expect(openEditor).toHaveBeenCalledWith({
      kind: "console",
      initialQuery: 'SELECT * FROM "sales"."orders"',
      queryName: "orders",
      preventAutoRun: true,
      schema: "sales",
      targetConnectionId: "connection-b",
    });
  });

  it("should omit contextual commands outside their context", () => {
    const scope: CommandScope = {
      connectionId: null,
      driver: null,
      table: null,
      runtime: {
        navigate: vi.fn(),
        openEditor: vi.fn(),
      },
    };

    expect(createBuiltInCommandItems(scope, labels)).toHaveLength(1);
  });
});
