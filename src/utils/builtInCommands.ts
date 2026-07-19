import type {
  CommandContext,
  CommandDefinition,
} from "../types/commands";

interface BuiltInCommandLabels {
  openSettings: string;
  openTableInConsole: string;
  navigationCategory: string;
  tableCategory: string;
}

export function createBuiltInCommands(
  context: CommandContext,
  labels: BuiltInCommandLabels,
): CommandDefinition[] {
  return [
    {
      id: "app.open-settings",
      title: labels.openSettings,
      category: labels.navigationCategory,
      keywords: ["preferences", "configuration"],
      execute: ({ navigate }) => navigate("/settings"),
    },
    {
      id: "table.open-in-console",
      title: labels.openTableInConsole,
      description:
        context.resource.type === "table"
          ? context.resource.tableName
          : undefined,
      category: labels.tableCategory,
      keywords: ["sql", "query", "console"],
      isAvailable: (currentContext) =>
        currentContext.resource.type === "table",
      getRelevance: (currentContext) =>
        currentContext.resource.type === "table" ? 100 : 0,
      execute: (runtime, currentContext) => {
        if (currentContext.resource.type !== "table") return;
        runtime.openTableConsole(currentContext.resource);
      },
    },
  ];
}
