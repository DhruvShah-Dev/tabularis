import { useContext } from "react";

import {
  CommandPaletteDispatchContext,
  CommandPaletteItemsContext,
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

export function useCommandPaletteItems() {
  const context = useContext(CommandPaletteItemsContext);
  if (!context) {
    throw new Error(
      "useCommandPaletteItems must be used inside a palette source provider",
    );
  }
  return context;
}
