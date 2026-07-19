import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCommandPalette } from "../../hooks/useCommandPalette";
import type { CommandDefinition } from "../../types/commands";
import { SpotlightPalette } from "../ui/SpotlightPalette";
import { CommandPaletteResults } from "./commandPalette/CommandPaletteResults";

export const CommandPaletteModal = () => {
  const { t } = useTranslation();
  const {
    closePalette,
    executeCommand,
    getResults,
    isOpen,
  } = useCommandPalette();
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const results = useMemo(
    () => getResults(query),
    [getResults, query],
  );
  const activeIndex = Math.min(
    selectedIndex,
    Math.max(results.length - 1, 0),
  );

  if (!isOpen) return null;

  const restoreFocus = () => {
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  };

  const handleClose = () => {
    closePalette();
    restoreFocus();
  };

  const handleExecute = async (command: CommandDefinition) => {
    if (isExecuting) return;
    setExecutionError(null);
    setIsExecuting(true);
    try {
      await executeCommand(command);
      restoreFocus();
    } catch {
      setExecutionError(t("commandPalette.executionError"));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <SpotlightPalette
      ariaLabel={t("commandPalette.title")}
      searchLabel={t("commandPalette.searchLabel")}
      closeLabel={t("common.close")}
      placeholder={t("commandPalette.placeholder")}
      query={query}
      itemCount={results.length}
      selectedIndex={activeIndex}
      onClose={handleClose}
      onQueryChange={(nextQuery) => {
        setQuery(nextQuery);
        setExecutionError(null);
      }}
      onSelectedIndexChange={setSelectedIndex}
      onSubmit={(index) => {
        const result = results[index];
        if (result) void handleExecute(result.command);
      }}
      isBusy={isExecuting}
      resultsId="command-palette-results"
      activeDescendant={
        results.length > 0
          ? `command-palette-option-${activeIndex}`
          : undefined
      }
      footer={
        <>
          <span />
          <div className="flex gap-4">
            <span>{t("commandPalette.navigationHint")}</span>
            <span>{t("commandPalette.executeHint")}</span>
            <span>{t("commandPalette.escapeHint")}</span>
          </div>
        </>
      }
    >
      <CommandPaletteResults
        results={results}
        activeIndex={activeIndex}
        executionError={executionError}
        onSelect={setSelectedIndex}
        onExecute={(command) => void handleExecute(command)}
      />
    </SpotlightPalette>
  );
};
