import type { KeyboardEvent, ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";

interface SpotlightPaletteProps {
  ariaLabel: string;
  searchLabel: string;
  closeLabel: string;
  placeholder: string;
  query: string;
  itemCount: number;
  selectedIndex: number;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelectedIndexChange: (index: number) => void;
  onSubmit: (index: number) => void;
  children: ReactNode;
  footer: ReactNode;
  isBusy?: boolean;
  resultsId?: string;
  activeDescendant?: string;
}

export const SpotlightPalette = ({
  ariaLabel,
  searchLabel,
  closeLabel,
  placeholder,
  query,
  itemCount,
  selectedIndex,
  onClose,
  onQueryChange,
  onSelectedIndexChange,
  onSubmit,
  children,
  footer,
  isBusy = false,
  resultsId = "spotlight-results",
  activeDescendant,
}: SpotlightPaletteProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      onSelectedIndexChange(
        itemCount === 0 ? 0 : (selectedIndex + 1) % itemCount,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      onSelectedIndexChange(
        itemCount === 0
          ? 0
          : (selectedIndex - 1 + itemCount) % itemCount,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (itemCount > 0) onSubmit(selectedIndex);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-busy={isBusy}
        className="flex max-h-[60vh] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-strong bg-elevated shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-default bg-base px-4 py-3">
          {isBusy ? (
            <Loader2
              size={18}
              className="shrink-0 animate-spin text-blue-400"
            />
          ) : (
            <Search size={18} className="shrink-0 text-secondary" />
          )}
          <input
            role="combobox"
            aria-label={searchLabel}
            aria-controls={resultsId}
            aria-expanded="true"
            aria-activedescendant={activeDescendant}
            autoFocus
            type="text"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              onSelectedIndexChange(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded p-1 text-secondary transition-colors hover:bg-surface-secondary hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {children}

        <div className="flex justify-between border-t border-default bg-base/50 px-4 py-2 text-[11px] text-muted">
          {footer}
        </div>
      </div>
    </div>
  );
};
