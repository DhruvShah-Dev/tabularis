import { ChevronDown, ChevronRight } from "lucide-react";

interface SidebarRoutineGroupHeaderProps {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Collapsible header for the Functions / Procedures groups inside the
 * Routines section. Styled with the same visual weight as the inner group
 * headers of table and view items (e.g. the "columns" row), so the Routines
 * section reads like the Views and Triggers sections instead of introducing
 * a second accordion-style hierarchy.
 */
export const SidebarRoutineGroupHeader = ({
  label,
  count,
  isOpen,
  onToggle,
}: SidebarRoutineGroupHeaderProps) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 px-2 py-1 w-full text-left text-xs text-muted hover:text-secondary transition-colors select-none"
  >
    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    <span>{label}</span>
    {/* mr-2.5 keeps the count's right edge aligned with the section-header
        action icons, which sit inside an mr-2.5 container. */}
    <span className="ml-auto mr-2.5 text-[10px] opacity-50">{count}</span>
  </button>
);
