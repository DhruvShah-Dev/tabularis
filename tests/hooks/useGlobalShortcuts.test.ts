import { fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGlobalShortcuts } from "../../src/hooks/useGlobalShortcuts";

const navigateMock = vi.fn();
const openPaletteMock = vi.fn();
const matchesShortcutMock = vi.fn(
  (_event: KeyboardEvent, id: string) => id === "command_palette_actions",
);

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../../src/hooks/useKeybindings", () => ({
  useKeybindings: () => ({
    matchesShortcut: matchesShortcutMock,
    isMac: true,
  }),
}));

vi.mock("../../src/hooks/useConnectionManager", () => ({
  useConnectionManager: () => ({
    openConnections: [],
    handleSwitch: vi.fn(),
  }),
}));

vi.mock("../../src/hooks/useCommandPalette", () => ({
  useCommandPalette: () => ({ openPalette: openPaletteMock }),
}));

describe("useGlobalShortcuts", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    openPaletteMock.mockClear();
    matchesShortcutMock.mockClear();
  });

  it("should open action search while focus is inside an input", () => {
    renderHook(() => useGlobalShortcuts());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, {
      key: "a",
      metaKey: true,
      shiftKey: true,
    });

    expect(openPaletteMock).toHaveBeenCalledWith();
    input.remove();
  });
});
