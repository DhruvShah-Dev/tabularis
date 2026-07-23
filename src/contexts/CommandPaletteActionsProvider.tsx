import {
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { CommandPaletteActionsContext } from "./CommandPaletteContext";
import { useCommandPaletteDispatch } from "../hooks/useCommandPalette";
import { useActiveCommandPaletteScope } from "../hooks/useCommandPaletteScope";
import { createBuiltInCommands } from "../utils/builtInCommands";
import { resolveCommands } from "../utils/commands";
import type { CommandDefinition } from "../types/commands";

interface CommandPaletteActionsProviderProps {
  children: ReactNode;
}

export const CommandPaletteActionsProvider = ({
  children,
}: CommandPaletteActionsProviderProps) => {
  const { t } = useTranslation();
  const { closePalette } = useCommandPaletteDispatch();
  const scope = useActiveCommandPaletteScope();

  const commands = useMemo(
    () =>
      createBuiltInCommands(scope?.context ?? {
        resource: { type: "none" },
      }, {
        openSettings: t("commandPalette.commands.openSettings"),
        openTableInConsole: t(
          "commandPalette.commands.openTableInConsole",
        ),
        navigationCategory: t("commandPalette.categories.navigation"),
        tableCategory: t("commandPalette.categories.table"),
      }),
    [scope?.context, t],
  );

  const getResults = useCallback(
    (query: string) =>
      resolveCommands(commands, {
        query,
        context: scope?.context ?? { resource: { type: "none" } },
      }),
    [commands, scope?.context],
  );

  const executeCommand = useCallback(
    async (command: CommandDefinition) => {
      if (!scope) return;
      await command.execute(scope.runtime, scope.context);
      closePalette();
    },
    [closePalette, scope],
  );

  const value = useMemo(
    () => ({
      executeCommand,
      getResults,
    }),
    [executeCommand, getResults],
  );

  return (
    <CommandPaletteActionsContext.Provider value={value}>
      {children}
    </CommandPaletteActionsContext.Provider>
  );
};
