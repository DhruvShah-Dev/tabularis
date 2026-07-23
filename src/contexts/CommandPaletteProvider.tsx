import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CommandPaletteDispatchContext,
  CommandPaletteStateContext,
} from "./CommandPaletteContext";
import { CommandPaletteScopeContext } from "./CommandPaletteScopeContext";
import { useConnectionLayoutContext } from "../hooks/useConnectionLayoutContext";
import { createCommandScopeStore, ROOT_COMMAND_SCOPE_ID } from "../utils/commandScopeStore";
import type { CommandPaletteMode } from "../types/commands";

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export const CommandPaletteProvider = ({
  children,
}: CommandPaletteProviderProps) => {
  const {
    explorerConnectionId,
    isSplitVisible,
    splitView,
  } = useConnectionLayoutContext();
  const [scopeStore] = useState(createCommandScopeStore);

  const [activePalette, setActivePalette] =
    useState<CommandPaletteMode | null>(null);

  const activeScopeId =
    splitView && isSplitVisible && explorerConnectionId
      ? explorerConnectionId
      : ROOT_COMMAND_SCOPE_ID;

  const openPalette = useCallback((nextMode: CommandPaletteMode) => {
    if (
      nextMode === "objects" &&
      !scopeStore.getScope(activeScopeId)?.connectionId
    ) {
      return;
    }
    setActivePalette(nextMode);
  }, [activeScopeId, scopeStore]);

  const closePalette = useCallback(() => setActivePalette(null), []);

  const stateValue = useMemo(
    () => ({
      activePalette,
    }),
    [activePalette],
  );

  const dispatchValue = useMemo(
    () => ({
      openPalette,
      closePalette,
    }),
    [closePalette, openPalette],
  );

  return (
    <CommandPaletteDispatchContext.Provider value={dispatchValue}>
      <CommandPaletteStateContext.Provider value={stateValue}>
        <CommandPaletteScopeContext.Provider value={scopeStore}>
          {children}
        </CommandPaletteScopeContext.Provider>
      </CommandPaletteStateContext.Provider>
    </CommandPaletteDispatchContext.Provider>
  );
};
