import { createContext } from "react";

import type {
  CommandDefinition,
  CommandResult,
} from "../types/commands";

export interface CommandPaletteContextType {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  getResults: (query: string) => CommandResult[];
  executeCommand: (command: CommandDefinition) => Promise<void>;
}

export const CommandPaletteContext = createContext<
  CommandPaletteContextType | undefined
>(undefined);
