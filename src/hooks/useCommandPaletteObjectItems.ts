import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { TableTarget } from "../types/databaseObjects";
import { getDatabaseList, isMultiDatabaseCapable } from "../utils/database";
import {
  createObjectPaletteItems,
  type ObjectPaletteRuntime,
} from "../utils/objectPaletteItems";
import { getNavigatorItems } from "../utils/quickNavigator";
import { useActiveCommandPaletteScope } from "./useCommandPaletteScope";
import { useDatabase } from "./useDatabase";
import { useDatabaseObjectActionRuntime } from "./useDatabaseObjectActionRuntime";

export function useCommandPaletteObjectItems(
  onGenerateSql: (target: TableTarget) => void,
  onInspect: (target: TableTarget) => void,
) {
  const { t } = useTranslation();
  const scope = useActiveCommandPaletteScope();
  const baseRuntime = useDatabaseObjectActionRuntime();
  const {
    activeConnectionId,
    connectionDataMap,
    connections,
    loadDatabaseData,
    loadSchemaData,
    setActiveTable,
  } = useDatabase();

  const connectionId = scope?.connectionId ?? null;
  const runtime = useMemo<ObjectPaletteRuntime>(
    () => ({
      ...baseRuntime,
      // Route through the scope so the object opens in the panel that owns it,
      // instead of the router-level editor baseRuntime navigates to.
      navigateToEditor: (request) =>
        scope?.runtime.openEditor(request),
      inspect: onInspect,
      generateSql: onGenerateSql,
      copyText: (value: string) =>
        navigator.clipboard.writeText(value),
      // setActiveTable always writes the root connection's schema preference,
      // so a split panel targeting another connection must not call it.
      setActiveTable: (table, schema) => {
        if (connectionId !== activeConnectionId) return;
        setActiveTable(table, schema);
      },
    }),
    [
      activeConnectionId,
      baseRuntime,
      connectionId,
      onGenerateSql,
      onInspect,
      scope,
      setActiveTable,
    ],
  );
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

  const navigatorItems = useMemo(
    () =>
      getNavigatorItems({
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
      }),
    [
      configuredDatabases,
      connectionData?.activeSchema,
      connectionData?.databaseDataMap,
      connectionData?.routines,
      connectionData?.schemaDataMap,
      connectionData?.schemas,
      connectionData?.tables,
      connectionData?.triggers,
      connectionData?.views,
      connectionId,
      hasSchemas,
      isMultiDatabase,
    ],
  );

  return useMemo(() => {
    if (!connectionId) return [];

    return createObjectPaletteItems({
      navigatorItems,
      connectionId,
      driver: connectionData?.driver ?? null,
      hasGroups: hasSchemas || isMultiDatabase,
      isMultiDatabase,
      runtime,
      labels: {
        inspect: t("editor.quickNavigator.actions.inspect"),
        newConsole: t("editor.quickNavigator.actions.newConsole"),
        generateSql: t(
          "editor.quickNavigator.actions.generateSql",
        ),
        countRows: t("editor.quickNavigator.actions.countRows"),
        query: t("editor.quickNavigator.actions.query"),
        copyName: t("editor.quickNavigator.actions.copyName"),
        type: {
          table: t("editor.quickNavigator.type_table"),
          view: t("editor.quickNavigator.type_view"),
          routine: t("editor.quickNavigator.type_routine"),
          trigger: t("editor.quickNavigator.type_trigger"),
        },
      },
    });
  }, [
    connectionData?.driver,
    connectionId,
    hasSchemas,
    isMultiDatabase,
    navigatorItems,
    runtime,
    t,
  ]);
}
