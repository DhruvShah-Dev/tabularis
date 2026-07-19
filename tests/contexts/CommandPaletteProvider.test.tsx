import { act, render } from "@testing-library/react";
import { useContext } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPaletteContext } from "../../src/contexts/CommandPaletteContext";
import type { CommandPaletteContextType } from "../../src/contexts/CommandPaletteContext";
import { CommandPaletteProvider } from "../../src/contexts/CommandPaletteProvider";

const navigateMock = vi.fn();
const addTabMock = vi.fn(() => "console-tab");

const databaseState = {
  activeConnectionId: "connection-1",
  activeDriver: "postgres",
  activeDatabaseName: "app",
  activeSchema: "public",
};

const editorState = {
  activeTab: {
    id: "table-tab",
    type: "table" as const,
    connectionId: "connection-1",
    activeTable: "users",
    schema: "public",
  },
  addTab: addTabMock,
};

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/editor" }),
    useNavigate: () => navigateMock,
  };
});

vi.mock("../../src/hooks/useDatabase", () => ({
  useDatabase: () => databaseState,
}));

vi.mock("../../src/hooks/useEditor", () => ({
  useEditor: () => editorState,
}));

function ContextConsumer({
  onContext,
}: {
  onContext: (context: CommandPaletteContextType) => void;
}) {
  const context = useContext(CommandPaletteContext);
  if (context) onContext(context);
  return null;
}

describe("CommandPaletteProvider", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    addTabMock.mockClear();
  });

  it("should expose global and contextual built-in commands", () => {
    let palette: CommandPaletteContextType | undefined;

    render(
      <CommandPaletteProvider>
        <ContextConsumer onContext={(context) => { palette = context; }} />
      </CommandPaletteProvider>,
    );

    expect(palette!.commands.map((command) => command.id)).toEqual([
      "app.open-settings",
      "table.open-in-console",
    ]);
    expect(
      palette!
        .getResults("", "actions")
        .map((result) => result.command.id),
    ).toContain("table.open-in-console");
  });

  it("should open the current table in a new SQL console", async () => {
    let palette: CommandPaletteContextType | undefined;

    render(
      <CommandPaletteProvider>
        <ContextConsumer onContext={(context) => { palette = context; }} />
      </CommandPaletteProvider>,
    );

    const command = palette!.commands.find(
      (candidate) => candidate.id === "table.open-in-console",
    );

    await act(async () => {
      await palette!.executeCommand(command!);
    });

    expect(addTabMock).toHaveBeenCalledWith({
      type: "console",
      title: "users",
      query: 'SELECT * FROM "public"."users"',
      schema: "public",
    });
    expect(navigateMock).toHaveBeenCalledWith("/editor");
  });

  it("should register and unregister an external command", () => {
    let palette: CommandPaletteContextType | undefined;

    render(
      <CommandPaletteProvider>
        <ContextConsumer onContext={(context) => { palette = context; }} />
      </CommandPaletteProvider>,
    );

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = palette!.registerCommand({
        id: "test.external",
        title: "External command",
        category: "test",
        modes: ["actions"],
        execute: vi.fn(),
      });
    });

    expect(palette!.commands.map((command) => command.id)).toContain(
      "test.external",
    );

    act(() => unregister!());

    expect(palette!.commands.map((command) => command.id)).not.toContain(
      "test.external",
    );
  });
});
