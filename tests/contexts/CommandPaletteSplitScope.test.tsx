import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CommandPaletteScopeBridge } from "../../src/components/layout/CommandPaletteScopeBridge";
import { CommandPaletteActionsProvider } from "../../src/contexts/CommandPaletteActionsProvider";
import { CommandPaletteProvider } from "../../src/contexts/CommandPaletteProvider";
import { DatabaseContext } from "../../src/contexts/DatabaseContext";
import type { DatabaseContextType } from "../../src/contexts/DatabaseContext";
import { EditorProvider } from "../../src/contexts/EditorProvider";
import {
  useCommandPaletteActions,
  useCommandPaletteDispatch,
  useCommandPaletteState,
} from "../../src/hooks/useCommandPalette";
import { useEditor } from "../../src/hooks/useEditor";
import type { Tab } from "../../src/types/editor";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: { connectionId?: string }) =>
    invokeMock(command, args),
}));

const layoutState = {
  splitView: {
    connectionIds: ["connection-a", "connection-b"],
    mode: "vertical" as const,
  },
  isSplitVisible: true,
  explorerConnectionId: "connection-b",
};

vi.mock("../../src/hooks/useConnectionLayoutContext", () => ({
  useConnectionLayoutContext: () => layoutState,
}));

function createTableTab(
  connectionId: string,
  tableName: string,
  schema: string,
): Tab {
  return {
    id: `${connectionId}-table`,
    title: tableName,
    type: "table",
    query: "",
    result: null,
    error: "",
    executionTime: null,
    page: 1,
    activeTable: tableName,
    pkColumns: null,
    connectionId,
    schema,
  };
}

function createDatabaseValue(
  connectionId: string,
  driver: string,
  schema: string,
): DatabaseContextType {
  return {
    activeConnectionId: connectionId,
    activeDriver: driver,
    activeSchema: schema,
  } as DatabaseContextType;
}

function Panel({
  connectionId,
  driver,
  schema,
}: {
  connectionId: string;
  driver: string;
  schema: string;
}) {
  return (
    <DatabaseContext.Provider
      value={createDatabaseValue(connectionId, driver, schema)}
    >
      <EditorProvider>
        <CommandPaletteScopeBridge scopeId={connectionId} />
        <PanelTabs connectionId={connectionId} />
      </EditorProvider>
    </DatabaseContext.Provider>
  );
}

function PanelTabs({ connectionId }: { connectionId: string }) {
  const { tabs } = useEditor();
  return (
    <output data-testid={`${connectionId}-tabs`}>
      {JSON.stringify(
        tabs.map((tab) => ({
          query: tab.query,
          title: tab.title,
          type: tab.type,
        })),
      )}
    </output>
  );
}

function PaletteHarness() {
  const { openPalette } = useCommandPaletteDispatch();
  const { activePalette } = useCommandPaletteState();
  return (
    <>
      <button type="button" onClick={() => openPalette("actions")}>
        Open actions
      </button>
      {activePalette === "actions" && (
        <CommandPaletteActionsProvider>
          <ActiveTableCommand />
        </CommandPaletteActionsProvider>
      )}
    </>
  );
}

function ActiveTableCommand() {
  const { executeCommand, getResults } = useCommandPaletteActions();
  const command = getResults("").find(
    (result) => result.command.id === "table.open-in-console",
  )?.command;

  if (!command) return <div>No table command</div>;

  return (
    <>
      <output data-testid="active-table">{command.description}</output>
      <button type="button" onClick={() => void executeCommand(command)}>
        Execute table command
      </button>
    </>
  );
}

describe("CommandPaletteProvider split-view scope", () => {
  it("should resolve and execute commands through the active panel EditorProvider", async () => {
    invokeMock.mockImplementation(
      (command: string, args?: { connectionId?: string }) => {
        if (command === "load_editor_preferences") {
          const connectionId = args?.connectionId;
          const isConnectionA = connectionId === "connection-a";
          const tab = createTableTab(
            connectionId ?? "",
            isConnectionA ? "table_a" : "table_b",
            isConnectionA ? "schema_a" : "schema_b",
          );
          return Promise.resolve({
            tabs: [tab],
            active_tab_id: tab.id,
          });
        }
        return Promise.resolve(null);
      },
    );

    render(
      <MemoryRouter initialEntries={["/editor"]}>
        <CommandPaletteProvider>
          <Panel
            connectionId="connection-a"
            driver="mysql"
            schema="schema_a"
          />
          <Panel
            connectionId="connection-b"
            driver="postgres"
            schema="schema_b"
          />
          <PaletteHarness />
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("connection-b-tabs")).toHaveTextContent(
        "table_b",
      ),
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open actions" }));
    });

    expect(await screen.findByTestId("active-table")).toHaveTextContent(
      "table_b",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Execute table command" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("connection-b-tabs")).toHaveTextContent(
        'SELECT * FROM \\"schema_b\\".\\"table_b\\"',
      ),
    );
    expect(screen.getByTestId("connection-a-tabs")).not.toHaveTextContent(
      "SELECT * FROM",
    );
  });
});
