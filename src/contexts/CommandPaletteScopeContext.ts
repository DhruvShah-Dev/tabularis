import { createContext } from "react";

import type { CommandScopeStore } from "../utils/commandScopeStore";

export const CommandPaletteScopeContext = createContext<
  CommandScopeStore | undefined
>(undefined);
