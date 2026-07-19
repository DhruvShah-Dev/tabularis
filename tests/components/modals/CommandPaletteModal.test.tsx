import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPaletteContext } from "../../../src/contexts/CommandPaletteContext";
import type { CommandPaletteContextType } from "../../../src/contexts/CommandPaletteContext";
import { CommandPaletteModal } from "../../../src/components/modals/CommandPaletteModal";
import type { CommandDefinition } from "../../../src/types/commands";

const settingsCommand: CommandDefinition = {
  id: "settings",
  title: "Open settings",
  category: "Navigation",
  execute: vi.fn(),
};

const consoleCommand: CommandDefinition = {
  id: "console",
  title: "Open table in console",
  category: "Table",
  execute: vi.fn(),
};

function renderPalette(
  overrides: Partial<CommandPaletteContextType> = {},
) {
  const closePalette = vi.fn();
  const executeCommand = vi.fn().mockResolvedValue(undefined);
  const commands = [settingsCommand, consoleCommand];
  const value: CommandPaletteContextType = {
    isOpen: true,
    openPalette: vi.fn(),
    closePalette,
    getResults: (query) =>
      commands
        .filter((command) =>
          command.title.toLowerCase().includes(query.toLowerCase()),
        )
        .map((command) => ({ command, score: 0 })),
    executeCommand,
    ...overrides,
  };

  render(
    <CommandPaletteContext.Provider value={value}>
      <CommandPaletteModal />
    </CommandPaletteContext.Provider>,
  );

  return { closePalette, executeCommand };
}

describe("CommandPaletteModal", () => {
  it("should autofocus the search input and filter commands", () => {
    renderPalette();

    const input = screen.getByRole("combobox", {
      name: "commandPalette.searchLabel",
    });
    expect(input).toHaveFocus();
    expect(screen.getByText("Open settings")).toBeInTheDocument();
    expect(screen.getByText("Open table in console")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "settings" } });

    expect(screen.getByText("Open settings")).toBeInTheDocument();
    expect(screen.queryByText("Open table in console")).not.toBeInTheDocument();
  });

  it("should navigate with arrow keys and execute with Enter", async () => {
    const { executeCommand } = renderPalette();
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(executeCommand).toHaveBeenCalledWith(consoleCommand),
    );
  });

  it("should close with Escape", () => {
    const { closePalette } = renderPalette();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(closePalette).toHaveBeenCalledTimes(1);
  });

  it("should keep the palette open and show execution errors", async () => {
    renderPalette({
      executeCommand: vi.fn().mockRejectedValue(new Error("Connection failed")),
    });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(
      await screen.findByText("commandPalette.executionError"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
