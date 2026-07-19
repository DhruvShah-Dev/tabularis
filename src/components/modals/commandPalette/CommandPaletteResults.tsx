import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Command } from "lucide-react";

import type {
  CommandDefinition,
  CommandResult,
} from "../../../types/commands";

interface CommandPaletteResultsProps {
  results: CommandResult[];
  activeIndex: number;
  executionError: string | null;
  onSelect: (index: number) => void;
  onExecute: (command: CommandDefinition) => void;
}

export const CommandPaletteResults = ({
  results,
  activeIndex,
  executionError,
  onSelect,
  onExecute,
}: CommandPaletteResultsProps) => {
  const { t } = useTranslation();
  let previousCategory: string | null = null;

  return (
    <div
      id="command-palette-results"
      role="listbox"
      className="min-h-24 flex-1 overflow-y-auto py-1"
    >
      {executionError ? (
        <div role="alert" className="px-4 py-3 text-sm text-red-400">
          {executionError}
        </div>
      ) : results.length === 0 ? (
        <div role="status" className="px-4 py-8 text-center text-sm text-muted">
          {t("commandPalette.noResults")}
        </div>
      ) : (
        results.map(({ command }, index) => {
          const showCategory = command.category !== previousCategory;
          previousCategory = command.category;
          const isActive = index === activeIndex;

          return (
            <Fragment key={command.id}>
              {showCategory && (
                <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted first:pt-2">
                  {command.category}
                </div>
              )}
              <button
                id={`command-palette-option-${index}`}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onExecute(command)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-surface-secondary text-primary"
                    : "text-secondary hover:bg-surface-secondary hover:text-primary"
                }`}
              >
                <Command size={15} className="shrink-0 text-blue-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {command.title}
                  </span>
                  {command.description && (
                    <span className="block truncate text-xs text-muted">
                      {command.description}
                    </span>
                  )}
                </span>
              </button>
            </Fragment>
          );
        })
      )}
    </div>
  );
};
