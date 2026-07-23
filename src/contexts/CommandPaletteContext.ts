import { createContext } from "react";

import type {
  CommandDefinition,
  CommandPaletteMode,
  CommandResult,
} from "../types/commands";

export interface CommandPaletteStateContextType {
  activePalette: CommandPaletteMode | null;
}

export interface CommandPaletteDispatchContextType {
  openPalette: (mode: CommandPaletteMode) => void;
  closePalette: () => void;
}

export interface CommandPaletteActionsContextType {
  getResults: (query: string) => CommandResult[];
  executeCommand: (command: CommandDefinition) => Promise<void>;
}

export const CommandPaletteStateContext = createContext<
  CommandPaletteStateContextType | undefined
>(undefined);

export const CommandPaletteDispatchContext = createContext<
  CommandPaletteDispatchContextType | undefined
>(undefined);

export const CommandPaletteActionsContext = createContext<
  CommandPaletteActionsContextType | undefined
>(undefined);
