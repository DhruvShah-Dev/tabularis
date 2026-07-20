import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPaletteContext } from "../../../src/contexts/CommandPaletteContext";
import type { CommandPaletteContextType } from "../../../src/contexts/CommandPaletteContext";
import { CommandPaletteModal } from "../../../src/components/modals/CommandPaletteModal";
import type { CommandDefinition } from "../../../src/types/commands";

vi.mock("../../../src/components/modals/QuickNavigatorModal", () => ({
  QuickNavigatorModal: ({
    onClose,
    onGenerateSql,
  }: {
    onClose: () => void;
    onGenerateSql?: (tableName: string) => void;
  }) => (
    <div role="dialog" aria-label="Object search">
      <button
        type="button"
        onClick={() => {
          onClose();
          onGenerateSql?.("users");
        }}
      >
        Generate SQL
      </button>
    </div>
  ),
}));

vi.mock("../../../src/components/modals/GenerateSQLModal", () => ({
  GenerateSQLModal: ({ tableName }: { tableName: string }) => (
    <div>Generate SQL for {tableName}</div>
  ),
}));

vi.mock("../../../src/components/modals/SchemaModal", () => ({
  SchemaModal: () => <div>Inspect table</div>,
}));

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
    mode: "actions",
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

  it("should clear its busy state after successful execution", async () => {
    const { executeCommand } = renderPalette();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    await waitFor(() => expect(executeCommand).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("should render the existing object navigator in objects mode", () => {
    renderPalette({ mode: "objects" });

    expect(
      screen.getByRole("dialog", { name: "Object search" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Open settings")).not.toBeInTheDocument();
  });

  it("should preserve object quick actions in the shared host", () => {
    const { closePalette } = renderPalette({ mode: "objects" });

    fireEvent.click(screen.getByRole("button", { name: "Generate SQL" }));

    expect(closePalette).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Generate SQL for users")).toBeInTheDocument();
  });
});
