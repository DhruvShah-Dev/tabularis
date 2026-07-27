import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { createBuiltInCommandItems } from "../utils/builtInCommands";
import { useActiveCommandPaletteScope } from "./useCommandPaletteScope";

export function useCommandPaletteActionItems() {
  const { t } = useTranslation();
  const scope = useActiveCommandPaletteScope();

  return useMemo(() => {
    if (!scope) return [];

    return createBuiltInCommandItems(scope, {
      openSettings: t("commandPalette.commands.openSettings"),
      openTableInConsole: t(
        "commandPalette.commands.openTableInConsole",
      ),
      navigationCategory: t("commandPalette.categories.navigation"),
      tableCategory: t("commandPalette.categories.table"),
    });
  }, [scope, t]);
}
