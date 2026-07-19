import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search, X } from "lucide-react";

import { useCommandPalette } from "../../hooks/useCommandPalette";
import type { CommandDefinition } from "../../types/commands";
import { CommandPaletteResults } from "./commandPalette/CommandPaletteResults";

export const CommandPaletteModal = () => {
  const { t } = useTranslation();
  const {
    closePalette,
    executeCommand,
    getResults,
    isOpen,
    mode,
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
    () => getResults(query, mode),
    [getResults, mode, query],
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
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex(
        results.length === 0 ? 0 : (activeIndex + 1) % results.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(
        results.length === 0
          ? 0
          : (activeIndex - 1 + results.length) % results.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) void handleExecute(result.command);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("commandPalette.title")}
        className="flex max-h-[60vh] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-strong bg-elevated shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-default bg-base px-4 py-3">
          {isExecuting ? (
            <Loader2
              size={18}
              className="shrink-0 animate-spin text-blue-400"
            />
          ) : (
            <Search size={18} className="shrink-0 text-secondary" />
          )}
          <input
            role="combobox"
            aria-label={t("commandPalette.searchLabel")}
            aria-controls="command-palette-results"
            aria-expanded="true"
            aria-activedescendant={
              results.length > 0
                ? `command-palette-option-${activeIndex}`
                : undefined
            }
            autoFocus
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
              setExecutionError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t(`commandPalette.placeholders.${mode}`)}
            className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("common.close")}
            className="rounded p-1 text-secondary transition-colors hover:bg-surface-secondary hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <CommandPaletteResults
          results={results}
          activeIndex={activeIndex}
          executionError={executionError}
          onSelect={setSelectedIndex}
          onExecute={(command) => void handleExecute(command)}
        />

        <div className="flex justify-end gap-4 border-t border-default bg-base/50 px-4 py-2 text-[11px] text-muted">
          <span>{t("commandPalette.navigationHint")}</span>
          <span>{t("commandPalette.executeHint")}</span>
          <span>{t("commandPalette.escapeHint")}</span>
        </div>
      </div>
    </div>
  );
};
