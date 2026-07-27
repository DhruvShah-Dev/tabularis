import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import {
  CommandPaletteDispatchContext,
  CommandPaletteStateContext,
} from "./CommandPaletteContext";
import { CommandPaletteScopeContext } from "./CommandPaletteScopeContext";
import { useConnectionLayoutContext } from "../hooks/useConnectionLayoutContext";
import {
  createCommandScopeStore,
  getActiveCommandScopeId,
} from "../utils/commandScopeStore";
import { resolveRenderedSplitLayout } from "../utils/connectionLayout";
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
  const location = useLocation();
  const [scopeStore] = useState(createCommandScopeStore);

  const [activePalette, setActivePalette] =
    useState<CommandPaletteMode | null>(null);

  const activeScopeId = getActiveCommandScopeId({
    explorerConnectionId,
    isSplitRendered: !!resolveRenderedSplitLayout({
      splitView,
      isSplitVisible,
      pathname: location.pathname,
    }),
  });

  const openPalette = useCallback((nextMode: CommandPaletteMode) => {
    const activeScope = scopeStore.getScope(activeScopeId);
    if (
      nextMode === "objects" &&
      !activeScope?.connectionId
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
  const scopeValue = useMemo(
    () => ({
      activeScopeId,
      store: scopeStore,
    }),
    [activeScopeId, scopeStore],
  );

  return (
    <CommandPaletteDispatchContext.Provider value={dispatchValue}>
      <CommandPaletteStateContext.Provider value={stateValue}>
        <CommandPaletteScopeContext.Provider value={scopeValue}>
          {children}
        </CommandPaletteScopeContext.Provider>
      </CommandPaletteStateContext.Provider>
    </CommandPaletteDispatchContext.Provider>
  );
};
