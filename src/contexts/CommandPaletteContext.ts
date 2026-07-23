import { createContext } from "react";

import type {
  CommandPaletteMode,
} from "../types/commands";
import type { PaletteItem } from "../types/palette";

export interface CommandPaletteStateContextType {
  activePalette: CommandPaletteMode | null;
}

export interface CommandPaletteDispatchContextType {
  openPalette: (mode: CommandPaletteMode) => void;
  closePalette: () => void;
}

export interface CommandPaletteItemsContextType {
  items: PaletteItem[];
}

export const CommandPaletteStateContext = createContext<
  CommandPaletteStateContextType | undefined
>(undefined);

export const CommandPaletteDispatchContext = createContext<
  CommandPaletteDispatchContextType | undefined
>(undefined);

export const CommandPaletteItemsContext = createContext<
  CommandPaletteItemsContextType | undefined
>(undefined);
