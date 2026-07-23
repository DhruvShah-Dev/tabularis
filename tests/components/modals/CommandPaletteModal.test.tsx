import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CommandPaletteActionsContext,
  CommandPaletteDispatchContext,
  CommandPaletteStateContext,
} from "../../../src/contexts/CommandPaletteContext";
import type {
  CommandPaletteActionsContextType,
  CommandPaletteDispatchContextType,
  CommandPaletteStateContextType,
} from "../../../src/contexts/CommandPaletteContext";
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
  overrides: {
    actions?: Partial<CommandPaletteActionsContextType>;
    dispatch?: Partial<CommandPaletteDispatchContextType>;
    state?: Partial<CommandPaletteStateContextType>;
  } = {},
) {
  const closePalette = vi.fn();
  const executeCommand = vi.fn().mockResolvedValue(undefined);
  const commands = [settingsCommand, consoleCommand];
  const stateValue: CommandPaletteStateContextType = {
    activePalette: "actions",
    ...overrides.state,
  };
  const dispatchValue: CommandPaletteDispatchContextType = {
    openPalette: vi.fn(),
    closePalette,
    ...overrides.dispatch,
  };
  const actionsValue: CommandPaletteActionsContextType = {
    getResults: (query) =>
      commands
        .filter((command) =>
          command.title.toLowerCase().includes(query.toLowerCase()),
        )
        .map((command) => ({ command, score: 0 })),
    executeCommand,
    ...overrides.actions,
  };

  render(
    <CommandPaletteDispatchContext.Provider value={dispatchValue}>
      <CommandPaletteStateContext.Provider value={stateValue}>
        <CommandPaletteActionsContext.Provider value={actionsValue}>
          <CommandPaletteModal />
        </CommandPaletteActionsContext.Provider>
      </CommandPaletteStateContext.Provider>
    </CommandPaletteDispatchContext.Provider>,
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
      actions: {
        executeCommand: vi.fn().mockRejectedValue(
          new Error("Connection failed"),
        ),
      },
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
    renderPalette({ state: { activePalette: "objects" } });

    expect(
      screen.getByRole("dialog", { name: "Object search" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Open settings")).not.toBeInTheDocument();
  });

  it("should preserve object quick actions in the shared host", () => {
    const { closePalette } = renderPalette({
      state: { activePalette: "objects" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate SQL" }));

    expect(closePalette).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Generate SQL for users")).toBeInTheDocument();
  });
});
