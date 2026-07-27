import {
  Fragment,
  useEffect,
  useRef,
  type ComponentType,
} from "react";
import {
  Code2,
  Command,
  Copy,
  Eye,
  FileCode,
  FileText,
  Hash,
  Play,
  Table2,
  Zap,
  type LucideProps,
} from "lucide-react";

import type {
  PaletteAction,
  PaletteIcon,
  PaletteItem,
} from "../../../types/palette";
import { PALETTE_RESULTS_ID, paletteOptionId } from "./paletteIds";

const ICONS: Record<PaletteIcon, ComponentType<LucideProps>> = {
  command: Command,
  copy: Copy,
  count: Hash,
  "generate-sql": Code2,
  inspect: FileText,
  "new-console": FileCode,
  query: Play,
  routine: Code2,
  table: Table2,
  trigger: Zap,
  view: Eye,
};

const ICON_COLORS: Partial<Record<PaletteIcon, string>> = {
  routine: "text-green-500",
  table: "text-blue-400",
  trigger: "text-orange-400",
  view: "text-purple-400",
};

function PaletteItemIcon({
  icon = "command",
  size = 15,
}: {
  icon?: PaletteIcon;
  size?: number;
}) {
  const Icon = ICONS[icon];
  return (
    <Icon
      size={size}
      className={`shrink-0 ${ICON_COLORS[icon] ?? "text-blue-400"}`}
    />
  );
}

interface PaletteResultsProps {
  items: PaletteItem[];
  activeIndex: number;
  executionError: string | null;
  noResults: string;
  onSelect: (index: number) => void;
  onExecute: (action: PaletteAction) => void;
}

export const PaletteResults = ({
  items,
  activeIndex,
  executionError,
  noResults,
  onSelect,
  onExecute,
}: PaletteResultsProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="flex min-h-24 flex-1 flex-col overflow-hidden">
      {executionError && (
        <div
          role="alert"
          className="shrink-0 border-b border-default px-4 py-2 text-sm text-red-400"
        >
          {executionError}
        </div>
      )}
      <div
        ref={listRef}
        id={PALETTE_RESULTS_ID}
        role="listbox"
        className="flex-1 overflow-y-auto py-1"
      >
        {items.length === 0 ? (
          <div
            role="status"
            className="px-4 py-8 text-center text-sm text-muted"
          >
            {noResults}
          </div>
        ) : (
          items.map((item, index) => {
            const showGroup =
              !!item.group && item.group !== items[index - 1]?.group;
            const isActive = index === activeIndex;

            return (
              <Fragment key={item.id}>
                {showGroup && (
                  <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted first:pt-2">
                    {item.group}
                  </div>
                )}
                <div
                  id={paletteOptionId(index)}
                  role="option"
                  aria-selected={isActive}
                  aria-label={item.title}
                  data-active={isActive}
                  onMouseEnter={() => onSelect(index)}
                  onClick={() => onExecute(item.primaryAction)}
                  className={`group flex cursor-pointer items-center transition-colors ${
                    isActive
                      ? "bg-surface-secondary text-primary"
                      : "text-secondary hover:bg-surface-secondary hover:text-primary"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left">
                    <PaletteItemIcon icon={item.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.title}
                      </span>
                      {item.description && (
                        <span className="block truncate text-xs text-muted">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </div>

                  {!!item.actions?.length && (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {item.actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          // Keyboard users drive the palette through the
                          // listbox, so these stay out of the tab order.
                          tabIndex={-1}
                          aria-label={action.label}
                          title={action.label}
                          onClick={(event) => {
                            event.stopPropagation();
                            onExecute(action);
                          }}
                          className="rounded p-1 text-muted transition-colors hover:bg-surface-tertiary hover:text-primary"
                        >
                          <PaletteItemIcon
                            icon={action.icon ?? "command"}
                            size={12}
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {item.badge && (
                    <span className="mr-4 shrink-0 rounded border border-default/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      {item.badge}
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};
