import type { CommandScope } from "../types/commands";
import type { PaletteItem } from "../types/palette";
import { createTableConsoleRequest } from "./databaseObjectActions";
import { PINNED_PALETTE_RELEVANCE } from "./paletteItems";

interface BuiltInCommandLabels {
  openSettings: string;
  openTableInConsole: string;
  navigationCategory: string;
  tableCategory: string;
}

export function createBuiltInCommandItems(
  scope: CommandScope,
  labels: BuiltInCommandLabels,
): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      id: "app.open-settings",
      title: labels.openSettings,
      group: labels.navigationCategory,
      keywords: ["preferences", "configuration"],
      icon: "command",
      primaryAction: {
        id: "app.open-settings",
        label: labels.openSettings,
        execute: () => scope.runtime.navigate("/settings"),
      },
    },
  ];

  if (scope.table) {
    const table = scope.table;
    items.push({
      id: "table.open-in-console",
      title: labels.openTableInConsole,
      description: table.tableName,
      group: labels.tableCategory,
      keywords: ["sql", "query", "console"],
      icon: "command",
      relevance: PINNED_PALETTE_RELEVANCE,
      primaryAction: {
        id: "table.open-in-console",
        label: labels.openTableInConsole,
        execute: () =>
          scope.runtime.openEditor(
            createTableConsoleRequest(
              {
                connectionId: table.connectionId,
                objectName: table.tableName,
                schema: table.schema,
              },
              scope.driver,
            ),
          ),
      },
    });
  }

  return items;
}
