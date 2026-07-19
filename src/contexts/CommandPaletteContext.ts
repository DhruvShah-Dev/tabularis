import { createContext } from "react";

import type {
  CommandContext,
  CommandDefinition,
  CommandPaletteMode,
  CommandResult,
} from "../types/commands";

export interface CommandPaletteContextType {
  commands: CommandDefinition[];
  context: CommandContext;
  isOpen: boolean;
  mode: CommandPaletteMode;
  openPalette: (mode?: CommandPaletteMode) => void;
  closePalette: () => void;
  registerCommand: (command: CommandDefinition) => () => void;
  getResults: (query: string, mode?: CommandPaletteMode) => CommandResult[];
  executeCommand: (command: CommandDefinition) => Promise<void>;
}

export const CommandPaletteContext = createContext<
  CommandPaletteContextType | undefined
>(undefined);
