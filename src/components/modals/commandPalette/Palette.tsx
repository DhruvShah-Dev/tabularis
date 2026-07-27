import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCommandPaletteDispatch } from "../../../hooks/useCommandPalette";
import type {
  PaletteAction,
  PaletteItem,
} from "../../../types/palette";
import { toErrorMessage } from "../../../utils/errors";
import { createPaletteSearch } from "../../../utils/paletteItems";
import { SpotlightPalette } from "../../ui/SpotlightPalette";
import { PaletteResults } from "./PaletteResults";
import { PALETTE_RESULTS_ID, paletteOptionId } from "./paletteIds";

export interface PaletteLabels {
  ariaLabel: string;
  searchLabel: string;
  placeholder: string;
  noResults: string;
  navigationHint: string;
  executeHint?: string;
  escapeHint: string;
  getCountLabel?: (count: number) => string;
}

interface PaletteProps {
  labels: PaletteLabels;
  items: PaletteItem[];
}

export const Palette = ({ labels, items }: PaletteProps) => {
  const { t } = useTranslation();
  const { closePalette } = useCommandPaletteDispatch();
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(
    null,
  );

  const search = useMemo(() => createPaletteSearch(items), [items]);
  const results = useMemo(() => search(query), [search, query]);
  const activeIndex = Math.min(
    selectedIndex,
    Math.max(results.length - 1, 0),
  );

  const restoreFocus = () => {
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  };

  const handleClose = () => {
    closePalette();
    restoreFocus();
  };

  const handleExecute = async (action: PaletteAction) => {
    if (isExecuting) return;
    setExecutionError(null);
    setIsExecuting(true);
    try {
      await action.execute();
      closePalette();
      restoreFocus();
    } catch (error) {
      setExecutionError(
        `${t("commandPalette.executionError")}: ${toErrorMessage(error)}`,
      );
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <SpotlightPalette
      ariaLabel={labels.ariaLabel}
      searchLabel={labels.searchLabel}
      closeLabel={t("common.close")}
      placeholder={labels.placeholder}
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
        const item = results[index];
        if (item) void handleExecute(item.primaryAction);
      }}
      isBusy={isExecuting}
      resultsId={PALETTE_RESULTS_ID}
      activeDescendant={
        results.length > 0 ? paletteOptionId(activeIndex) : undefined
      }
      footer={
        <>
          <span>{labels.getCountLabel?.(results.length)}</span>
          <div className="flex gap-4">
            <span>{labels.navigationHint}</span>
            {labels.executeHint && <span>{labels.executeHint}</span>}
            <span>{labels.escapeHint}</span>
          </div>
        </>
      }
    >
      <PaletteResults
        items={results}
        activeIndex={activeIndex}
        executionError={executionError}
        noResults={labels.noResults}
        onSelect={setSelectedIndex}
        onExecute={(action) => void handleExecute(action)}
      />
    </SpotlightPalette>
  );
};
