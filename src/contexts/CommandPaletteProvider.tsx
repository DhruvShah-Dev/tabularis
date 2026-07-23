import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  CommandPaletteActionsContext,
  CommandPaletteDispatchContext,
  CommandPaletteStateContext,
} from "./CommandPaletteContext";
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

  const [activePalette, setActivePalette] =
    useState<CommandPaletteMode | null>(null);

  const context = useMemo<CommandContext>(() => {
    if (activePalette !== "actions") {
      return { resource: { type: "none" } };
    }
    return createCommandContext({
      pathname: location.pathname,
      activeConnectionId,
      activeSchema,
      activeTab: activeTab
        ? {
            type: activeTab.type,
            activeTable: activeTab.activeTable,
            schema: activeTab.schema,
          }
        : null,
    });
  }, [
    activePalette,
    activeConnectionId,
    activeSchema,
    activeTab?.activeTable,
    activeTab?.schema,
    activeTab?.type,
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
    setActivePalette(nextMode);
  }, [activeConnectionId]);

  const closePalette = useCallback(() => setActivePalette(null), []);

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
      setActivePalette(null);
    },
    [context, runtime],
  );

  const stateValue = useMemo(
    () => ({
      activePalette,
    }),
    [activePalette],
  );

  const dispatchValue = useMemo(
    () => ({
      openPalette,
      closePalette,
    }),
    [closePalette, openPalette],
  );

  const actionsValue = useMemo(
    () => ({
      getResults,
      executeCommand,
    }),
    [
      executeCommand,
      getResults,
    ],
  );

  return (
    <CommandPaletteDispatchContext.Provider value={dispatchValue}>
      <CommandPaletteStateContext.Provider value={stateValue}>
        <CommandPaletteActionsContext.Provider value={actionsValue}>
          {children}
        </CommandPaletteActionsContext.Provider>
      </CommandPaletteStateContext.Provider>
    </CommandPaletteDispatchContext.Provider>
  );
};
