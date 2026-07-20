import { createContext } from "react";

import type {
  CommandDefinition,
  CommandPaletteMode,
  CommandResult,
} from "../types/commands";

export interface CommandPaletteContextType {
  isOpen: boolean;
  mode: CommandPaletteMode;
  openPalette: (mode: CommandPaletteMode) => void;
  closePalette: () => void;
  getResults: (query: string) => CommandResult[];
  executeCommand: (command: CommandDefinition) => Promise<void>;
}

export const CommandPaletteContext = createContext<
  CommandPaletteContextType | undefined
>(undefined);
