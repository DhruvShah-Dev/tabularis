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

    expect(palette!.getResults("").map((result) => result.command.id)).toEqual([
      "table.open-in-console",
      "app.open-settings",
    ]);
  });

  it("should open the current table in a new SQL console", async () => {
    let palette: CommandPaletteContextType | undefined;

    render(
      <CommandPaletteProvider>
        <ContextConsumer onContext={(context) => { palette = context; }} />
      </CommandPaletteProvider>,
    );

    const command = palette!
      .getResults("")
      .find((result) => result.command.id === "table.open-in-console")
      ?.command;

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

});
