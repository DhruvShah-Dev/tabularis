import {
  useCallback,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";

import { CommandPaletteScopeContext } from "../contexts/CommandPaletteScopeContext";
import { useConnectionLayoutContext } from "./useConnectionLayoutContext";
import type { CommandScope } from "../types/commands";
import { ROOT_COMMAND_SCOPE_ID } from "../utils/commandScopeStore";

function useCommandScopeStore() {
  const store = useContext(CommandPaletteScopeContext);
  if (!store) {
    throw new Error(
      "Command palette scopes must be used inside CommandPaletteProvider",
    );
  }
  return store;
}

export function useRegisterCommandPaletteScope(
  scopeId: string,
  scope: CommandScope,
) {
  const store = useCommandScopeStore();

  useLayoutEffect(
    () => store.registerScope(scopeId, scope),
    [scope, scopeId, store],
  );
}

export function useActiveCommandPaletteScope(): CommandScope | undefined {
  const store = useCommandScopeStore();
  const {
    explorerConnectionId,
    isSplitVisible,
    splitView,
  } = useConnectionLayoutContext();
  const scopeId =
    splitView && isSplitVisible && explorerConnectionId
      ? explorerConnectionId
      : ROOT_COMMAND_SCOPE_ID;
  const getSnapshot = useCallback(
    () => store.getScope(scopeId),
    [scopeId, store],
  );

  return useSyncExternalStore(
    store.subscribe,
    getSnapshot,
    getSnapshot,
  );
}
