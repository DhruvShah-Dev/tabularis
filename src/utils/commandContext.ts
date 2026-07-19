import type { CommandContext } from "../types/commands";
import type { Tab } from "../types/editor";

interface CreateCommandContextOptions {
  pathname: string;
  activeConnectionId: string | null;
  activeSchema: string | null;
  activeTab: Pick<Tab, "type" | "activeTable" | "schema"> | null;
}

export function createCommandContext(
  options: CreateCommandContextOptions,
): CommandContext {
  const {
    activeConnectionId,
    activeSchema,
    activeTab,
    pathname,
  } = options;
  const isEditor = pathname === "/editor";
  const isTable =
    isEditor &&
    activeConnectionId !== null &&
    activeTab?.type === "table" &&
    activeTab.activeTable !== null;

  if (!isTable) return { resource: { type: "none" } };

  return {
    resource: {
      type: "table",
      tableName: activeTab.activeTable,
      schema: activeTab.schema ?? activeSchema ?? undefined,
    },
  };
}
