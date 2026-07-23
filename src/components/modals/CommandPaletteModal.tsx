import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCommandPaletteState } from "../../hooks/useCommandPalette";
import { CommandPaletteActionsProvider } from "../../contexts/CommandPaletteActionsProvider";
import { CommandPaletteObjectsProvider } from "../../contexts/CommandPaletteObjectsProvider";
import { GenerateSQLModal } from "./GenerateSQLModal";
import { SchemaModal } from "./SchemaModal";
import { Palette } from "./commandPalette/Palette";

export const CommandPaletteModal = () => {
  const { t } = useTranslation();
  const { activePalette } = useCommandPaletteState();
  const [generateSQLTable, setGenerateSQLTable] = useState<string | null>(null);
  const [inspectTable, setInspectTable] = useState<{
    tableName: string;
    schema?: string;
  } | null>(null);
  const palette =
    activePalette === null ? null : (
      <Palette
        labels={
          activePalette === "actions"
            ? {
                ariaLabel: t("commandPalette.title"),
                searchLabel: t("commandPalette.searchLabel"),
                placeholder: t("commandPalette.placeholder"),
                noResults: t("commandPalette.noResults"),
                navigationHint: t("commandPalette.navigationHint"),
                executeHint: t("commandPalette.executeHint"),
                escapeHint: t("commandPalette.escapeHint"),
              }
            : {
                ariaLabel: t("settings.shortcuts.quickNavigator"),
                searchLabel: t("editor.quickNavigator.placeholder"),
                placeholder: t("editor.quickNavigator.placeholder"),
                noResults: t("editor.quickNavigator.noResults"),
                navigationHint: t(
                  "editor.quickNavigator.navigationHint",
                ),
                escapeHint: t("editor.quickNavigator.escHint"),
                getCountLabel: (count: number) =>
                  count === 1
                    ? t("editor.quickNavigator.count_one")
                    : t("editor.quickNavigator.count_other", {
                        count,
                      }),
              }
        }
      />
    );

  return (
    <>
      {activePalette === "actions" && (
        <CommandPaletteActionsProvider>{palette}</CommandPaletteActionsProvider>
      )}
      {activePalette === "objects" && (
        <CommandPaletteObjectsProvider
          onGenerateSql={setGenerateSQLTable}
          onInspect={(tableName, schema) =>
            setInspectTable({ tableName, schema })
          }
        >
          {palette}
        </CommandPaletteObjectsProvider>
      )}
      {generateSQLTable && (
        <GenerateSQLModal
          isOpen
          tableName={generateSQLTable}
          onClose={() => setGenerateSQLTable(null)}
        />
      )}
      {inspectTable && (
        <SchemaModal
          isOpen
          tableName={inspectTable.tableName}
          schema={inspectTable.schema}
          onClose={() => setInspectTable(null)}
        />
      )}
    </>
  );
};
