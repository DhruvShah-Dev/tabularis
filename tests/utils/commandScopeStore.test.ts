import { describe, expect, it, vi } from "vitest";

import type { CommandScope } from "../../src/types/commands";
import { createCommandScopeStore } from "../../src/utils/commandScopeStore";

function createScope(connectionId: string): CommandScope {
  return {
    connectionId,
    context: {
      connectionId,
      resource: { type: "none" },
    },
    runtime: {
      navigate: vi.fn(),
      openTableConsole: vi.fn(),
    },
  };
}

describe("createCommandScopeStore", () => {
  it("should keep the latest scope when an older registration unmounts", () => {
    const store = createCommandScopeStore();
    const oldScope = createScope("old");
    const newScope = createScope("new");

    const unregisterOldScope = store.registerScope("panel", oldScope);
    store.registerScope("panel", newScope);

    unregisterOldScope();

    expect(store.getScope("panel")).toBe(newScope);
  });
});
