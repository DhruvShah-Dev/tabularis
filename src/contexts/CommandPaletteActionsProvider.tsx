import {
  useMemo,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { CommandPaletteItemsContext } from "./CommandPaletteContext";
import { useActiveCommandPaletteScope } from "../hooks/useCommandPaletteScope";
import { createBuiltInCommands } from "../utils/builtInCommands";

interface CommandPaletteActionsProviderProps {
  children: ReactNode;
}

export const CommandPaletteActionsProvider = ({
  children,
}: CommandPaletteActionsProviderProps) => {
  const { t } = useTranslation();
  const scope = useActiveCommandPaletteScope();

  const items = useMemo(() => {
    const context = scope?.context ?? {
      resource: { type: "none" as const },
    };
    const commands = createBuiltInCommands(
      context,
      {
        openSettings: t("commandPalette.commands.openSettings"),
        openTableInConsole: t(
          "commandPalette.commands.openTableInConsole",
        ),
        navigationCategory: t("commandPalette.categories.navigation"),
        tableCategory: t("commandPalette.categories.table"),
      },
    );

    return commands
      .filter(
        (command) =>
          !command.isAvailable || command.isAvailable(context),
      )
      .map((command) => ({
        id: command.id,
        title: command.title,
        description: command.description,
        group: command.category,
        keywords: command.keywords,
        icon: "command" as const,
        relevance: command.getRelevance?.(context) ?? 0,
        primaryAction: {
          id: command.id,
          label: command.title,
          execute: async () => {
            if (!scope) return;
            await command.execute(scope.runtime, scope.context);
          },
        },
      }));
  }, [scope, t]);

  const value = useMemo(
    () => ({
      items,
    }),
    [items],
  );

  return (
    <CommandPaletteItemsContext.Provider value={value}>
      {children}
    </CommandPaletteItemsContext.Provider>
  );
};
