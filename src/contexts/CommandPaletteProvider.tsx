import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { CommandPaletteContext } from "./CommandPaletteContext";
import { useDatabase } from "../hooks/useDatabase";
import { useEditor } from "../hooks/useEditor";
import { newConsoleForTable } from "../utils/newConsole";
import { createBuiltInCommands } from "../utils/builtInCommands";
import { createCommandContext } from "../utils/commandContext";
import { resolveCommands } from "../utils/commands";
import type {
  CommandContext,
  CommandDefinition,
  CommandPaletteMode,
  CommandRuntime,
} from "../types/commands";

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export const CommandPaletteProvider = ({
  children,
}: CommandPaletteProviderProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeConnectionId,
    activeDriver,
    activeSchema,
  } = useDatabase();
  const { activeTab, addTab } = useEditor();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<CommandPaletteMode>("actions");

  const context = useMemo<CommandContext>(() => createCommandContext({
    pathname: location.pathname,
    activeConnectionId,
    activeSchema,
    activeTab,
  }), [
    activeConnectionId,
    activeSchema,
    activeTab,
    location.pathname,
  ]);

  const builtInCommands = useMemo<CommandDefinition[]>(
    () =>
      createBuiltInCommands(context, {
        openSettings: t("commandPalette.commands.openSettings"),
        openTableInConsole: t(
          "commandPalette.commands.openTableInConsole",
        ),
        navigationCategory: t("commandPalette.categories.navigation"),
        tableCategory: t("commandPalette.categories.table"),
      }),
    [context, t],
  );

  const runtime = useMemo<CommandRuntime>(
    () => ({
      navigate: (path) => navigate(path),
      openTableConsole: (resource) => {
        const spec = newConsoleForTable(
          resource.tableName,
          activeDriver,
          resource.schema,
        );
        addTab({
          type: "console",
          title: spec.title,
          query: spec.sql,
          schema: spec.schema,
        });
        navigate("/editor");
      },
    }),
    [activeDriver, addTab, navigate],
  );

  const openPalette = useCallback((nextMode: CommandPaletteMode) => {
    if (nextMode === "objects" && activeConnectionId === null) return;
    setMode(nextMode);
    setIsOpen(true);
  }, [activeConnectionId]);

  const closePalette = useCallback(() => setIsOpen(false), []);

  const getResults = useCallback(
    (query: string) =>
      resolveCommands(builtInCommands, {
        query,
        context,
      }),
    [builtInCommands, context],
  );

  const executeCommand = useCallback(
    async (command: CommandDefinition) => {
      await command.execute(runtime, context);
      setIsOpen(false);
    },
    [context, runtime],
  );

  const value = useMemo(
    () => ({
      isOpen,
      mode,
      openPalette,
      closePalette,
      getResults,
      executeCommand,
    }),
    [
      closePalette,
      executeCommand,
      getResults,
      isOpen,
      mode,
      openPalette,
    ],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
};
