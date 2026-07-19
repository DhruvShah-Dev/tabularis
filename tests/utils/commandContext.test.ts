import { describe, expect, it } from "vitest";

import { createCommandContext } from "../../src/utils/commandContext";

const tableTab = {
  id: "table-tab",
  type: "table" as const,
  connectionId: "connection-1",
  activeTable: "users",
  schema: "public",
};

describe("createCommandContext", () => {
  it("should expose the table resource while viewing a table tab", () => {
    const context = createCommandContext({
      pathname: "/editor",
      activeConnectionId: "connection-1",
      activeSchema: "public",
      activeTab: tableTab,
    });

    expect(context.resource).toEqual({
      type: "table",
      tableName: "users",
      schema: "public",
    });
  });

  it("should not leak the last editor resource onto settings", () => {
    const context = createCommandContext({
      pathname: "/settings",
      activeConnectionId: "connection-1",
      activeSchema: "public",
      activeTab: tableTab,
    });

    expect(context.resource).toEqual({ type: "none" });
  });
});
