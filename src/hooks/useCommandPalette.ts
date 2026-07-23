import { useContext } from "react";

import {
  CommandPaletteActionsContext,
  CommandPaletteDispatchContext,
  CommandPaletteStateContext,
} from "../contexts/CommandPaletteContext";

export function useCommandPaletteState() {
  const context = useContext(CommandPaletteStateContext);
  if (!context) {
    throw new Error(
      "useCommandPaletteState must be used inside CommandPaletteProvider",
    );
  }
  return context;
}

export function useCommandPaletteDispatch() {
  const context = useContext(CommandPaletteDispatchContext);
  if (!context) {
    throw new Error(
      "useCommandPaletteDispatch must be used inside CommandPaletteProvider",
    );
  }
  return context;
}

export function useCommandPaletteActions() {
  const context = useContext(CommandPaletteActionsContext);
  if (!context) {
    throw new Error(
      "useCommandPaletteActions must be used inside CommandPaletteProvider",
    );
  }
  return context;
}
