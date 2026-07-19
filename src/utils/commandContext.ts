import type {
  CommandContext,
  CommandSurface,
} from "../types/commands";

interface CommandContextTab {
  id: string;
  type: "console" | "table" | "query_builder" | "notebook";
  connectionId: string;
  activeTable: string | null;
  schema?: string;
}

interface CreateCommandContextOptions {
  pathname: string;
  activeConnectionId: string | null;
  activeDriver: string | null;
  activeDatabaseName: string | null;
  activeSchema: string | null;
  activeTab: CommandContextTab | null;
}

function getSurface(pathname: string, activeTabType?: string): CommandSurface {
  if (pathname === "/connections") return "connections";
  if (pathname === "/settings") return "settings";
  if (pathname === "/schema-diagram") return "schema-diagram";
  if (pathname !== "/editor") return "other";
  if (activeTabType === "table") return "table";
  if (activeTabType === "notebook") return "notebook";
  return "console";
}

export function createCommandContext(
  options: CreateCommandContextOptions,
): CommandContext {
  const {
    activeConnectionId,
    activeDatabaseName,
    activeDriver,
    activeSchema,
    activeTab,
    pathname,
  } = options;
  const resource =
    activeConnectionId && activeTab?.type === "table" && activeTab.activeTable
      ? {
          type: "table" as const,
          connectionId: activeTab.connectionId,
          tableName: activeTab.activeTable,
          database: activeDatabaseName ?? undefined,
          schema: activeTab.schema ?? activeSchema ?? undefined,
        }
      : activeConnectionId && activeTab?.type === "console"
        ? {
            type: "console" as const,
            connectionId: activeTab.connectionId,
            tabId: activeTab.id,
          }
        : activeConnectionId
          ? {
              type: "connection" as const,
              connectionId: activeConnectionId,
            }
          : { type: "none" as const };

  return {
    surface: getSurface(pathname, activeTab?.type),
    connectionId: activeConnectionId,
    driver: activeDriver,
    database: activeDatabaseName,
    schema: activeTab?.schema ?? activeSchema,
    resource,
  };
}
