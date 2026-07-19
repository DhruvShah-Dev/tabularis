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
import {
  addCommand,
  removeCommand,
  resolveCommands,
} from "../utils/commands";
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
    activeDatabaseName,
    activeSchema,
  } = useDatabase();
  const { activeTab, addTab } = useEditor();

  const [externalCommands, setExternalCommands] = useState<
    CommandDefinition[]
  >([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<CommandPaletteMode>("actions");

  const context = useMemo<CommandContext>(() => createCommandContext({
    pathname: location.pathname,
    activeConnectionId,
    activeDriver,
    activeDatabaseName,
    activeSchema,
    activeTab,
  }), [
    activeConnectionId,
    activeDatabaseName,
    activeDriver,
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
    [context.resource, t],
  );

  const commands = useMemo(
    () => [...builtInCommands, ...externalCommands],
    [builtInCommands, externalCommands],
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

  const openPalette = useCallback((nextMode: CommandPaletteMode = "all") => {
    setMode(nextMode);
    setIsOpen(true);
  }, []);

  const closePalette = useCallback(() => setIsOpen(false), []);

  const registerCommand = useCallback(
    (command: CommandDefinition) => {
      if (commands.some((candidate) => candidate.id === command.id)) {
        throw new Error(`Command "${command.id}" is already registered`);
      }

      setExternalCommands((current) => addCommand(current, command));
      let isRegistered = true;
      return () => {
        if (!isRegistered) return;
        isRegistered = false;
        setExternalCommands((current) => removeCommand(current, command.id));
      };
    },
    [commands],
  );

  const getResults = useCallback(
    (query: string, requestedMode: CommandPaletteMode = mode) =>
      resolveCommands(commands, {
        mode: requestedMode,
        query,
        context,
      }),
    [commands, context, mode],
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
      commands,
      context,
      isOpen,
      mode,
      openPalette,
      closePalette,
      registerCommand,
      getResults,
      executeCommand,
    }),
    [
      closePalette,
      commands,
      context,
      executeCommand,
      getResults,
      isOpen,
      mode,
      openPalette,
      registerCommand,
    ],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
};
