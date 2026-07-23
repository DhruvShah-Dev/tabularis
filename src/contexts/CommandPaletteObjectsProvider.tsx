import { useEffect, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { CommandPaletteItemsContext } from "./CommandPaletteContext";
import type {
  RoutineInfo,
  TriggerInfo,
} from "./DatabaseContext";
import { useDatabase } from "../hooks/useDatabase";
import { useActiveCommandPaletteScope } from "../hooks/useCommandPaletteScope";
import { getDatabaseList, isMultiDatabaseCapable } from "../utils/database";
import { quoteTableRef } from "../utils/identifiers";
import { newConsoleForTable } from "../utils/newConsole";
import { getNavigatorItems } from "../utils/quickNavigator";
import type { PaletteAction, PaletteItem } from "../types/palette";

interface CommandPaletteObjectsProviderProps {
  children: ReactNode;
  onGenerateSql: (tableName: string) => void;
  onInspect: (tableName: string, schema?: string) => void;
}

export const CommandPaletteObjectsProvider = ({
  children,
  onGenerateSql,
  onInspect,
}: CommandPaletteObjectsProviderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scope = useActiveCommandPaletteScope();
  const {
    connectionDataMap,
    connections,
    loadDatabaseData,
    loadSchemaData,
  } = useDatabase();

  const connectionId = scope?.connectionId ?? null;
  const connectionData = connectionId
    ? connectionDataMap[connectionId]
    : undefined;
  const connection = connections.find(
    (candidate) => candidate.id === connectionId,
  );
  const configuredDatabases = useMemo(
    () => getDatabaseList(connection?.params.database ?? ""),
    [connection?.params.database],
  );
  const hasSchemas = !!connectionData?.capabilities?.schemas;
  const isMultiDatabase = isMultiDatabaseCapable(
    connectionData?.capabilities,
  );

  useEffect(() => {
    if (!connectionId) return;

    if (hasSchemas) {
      connectionData?.schemas.forEach((schema) => {
        void loadSchemaData(schema, connectionId);
      });
      return;
    }

    if (isMultiDatabase) {
      configuredDatabases.forEach((database) => {
        void loadDatabaseData(database, connectionId);
      });
    }
  }, [
    configuredDatabases,
    connectionData?.schemas,
    connectionId,
    hasSchemas,
    isMultiDatabase,
    loadDatabaseData,
    loadSchemaData,
  ]);

  const items = useMemo<PaletteItem[]>(() => {
    const navigatorItems = getNavigatorItems({
      activeConnectionId: connectionId,
      hasSchemas,
      isMultiDb: isMultiDatabase,
      schemas: connectionData?.schemas ?? [],
      schemaDataMap: connectionData?.schemaDataMap ?? {},
      configuredDatabases,
      databaseDataMap: connectionData?.databaseDataMap ?? {},
      tables: connectionData?.tables ?? [],
      views: connectionData?.views ?? [],
      routines: connectionData?.routines ?? [],
      triggers: connectionData?.triggers ?? [],
      activeSchema: connectionData?.activeSchema ?? null,
    });

    return navigatorItems.map((item) => {
      const quotedObject = isMultiDatabase
        ? quoteTableRef(item.name, connectionData?.driver ?? null)
        : quoteTableRef(
            item.name,
            connectionData?.driver ?? null,
            item.schema,
          );
      const navigateToQuery = (
        initialQuery: string,
        extraState: Record<string, unknown> = {},
      ) =>
        navigate("/editor", {
          state: {
            initialQuery,
            schema: item.schema,
            targetConnectionId: connectionId,
            ...extraState,
          },
        });

      const executePrimary = async () => {
        if (item.type === "table" || item.type === "view") {
          navigateToQuery(`SELECT * FROM ${quotedObject}`, {
            tableName: item.name,
            title:
              isMultiDatabase && item.schema
                ? `${item.name} (${item.schema})`
                : undefined,
          });
          return;
        }

        if (item.type === "routine") {
          const definition = await invoke<string>(
            "get_routine_definition",
            {
              connectionId,
              routineName: item.name,
              routineType: (item.item as RoutineInfo).routine_type,
              ...(item.schema ? { schema: item.schema } : {}),
            },
          );
          navigateToQuery(definition, {
            queryName: `${item.name} Definition`,
            preventAutoRun: true,
          });
          return;
        }

        const definition = await invoke<string>(
          "get_trigger_definition",
          {
            connectionId,
            triggerName: item.name,
            tableName: (item.item as TriggerInfo).table_name,
            ...(item.schema ? { schema: item.schema } : {}),
          },
        );
        navigateToQuery(definition, {
          queryName: `${item.name} Definition`,
          preventAutoRun: true,
          readOnly: true,
        });
      };

      const actions: PaletteAction[] = [];

      if (item.type === "table") {
        actions.push(
          {
            id: "inspect",
            label: t("editor.quickNavigator.actions.inspect"),
            icon: "inspect",
            execute: () => onInspect(item.name, item.schema),
          },
          {
            id: "new-console",
            label: t("editor.quickNavigator.actions.newConsole"),
            icon: "new-console",
            execute: () => {
              const spec = newConsoleForTable(
                item.name,
                connectionData?.driver ?? null,
                item.schema,
              );
              navigateToQuery(spec.sql, {
                queryName: spec.title,
                preventAutoRun: true,
              });
            },
          },
          {
            id: "generate-sql",
            label: t("editor.quickNavigator.actions.generateSql"),
            icon: "generate-sql",
            execute: () => onGenerateSql(item.name),
          },
        );
      }

      if (item.type === "table" || item.type === "view") {
        actions.push(
          {
            id: "count",
            label: t("editor.quickNavigator.actions.countRows"),
            icon: "count",
            execute: () =>
              navigateToQuery(
                `SELECT COUNT(*) as count FROM ${quotedObject}`,
              ),
          },
          {
            id: "query",
            label: t("editor.quickNavigator.actions.query"),
            icon: "query",
            execute: executePrimary,
          },
        );
      }

      actions.push({
        id: "copy",
        label: t("editor.quickNavigator.actions.copyName"),
        icon: "copy",
        execute: () => navigator.clipboard.writeText(item.name),
      });

      return {
        id: `${item.type}:${item.schema ?? ""}:${item.name}`,
        title: item.name,
        description: item.detail,
        group:
          hasSchemas || isMultiDatabase ? item.schema : undefined,
        badge: t(`editor.quickNavigator.type_${item.type}`),
        keywords: item.schema ? [item.schema] : undefined,
        icon: item.type,
        primaryAction: {
          id: "open",
          label: t("editor.quickNavigator.actions.query"),
          execute: executePrimary,
        },
        actions,
      };
    });
  }, [
    configuredDatabases,
    connectionData,
    connectionId,
    hasSchemas,
    isMultiDatabase,
    navigate,
    onGenerateSql,
    onInspect,
    t,
  ]);

  const value = useMemo(() => ({ items }), [items]);

  return (
    <CommandPaletteItemsContext.Provider value={value}>
      {children}
    </CommandPaletteItemsContext.Provider>
  );
};
