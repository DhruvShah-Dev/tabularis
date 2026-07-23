import { act, render } from "@testing-library/react";
import { memo } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPaletteProvider } from "../../src/contexts/CommandPaletteProvider";
import { CommandPaletteActionsProvider } from "../../src/contexts/CommandPaletteActionsProvider";
import { CommandPaletteScopeBridge } from "../../src/components/layout/CommandPaletteScopeBridge";
import {
  useCommandPaletteDispatch,
  useCommandPaletteItems,
  useCommandPaletteState,
} from "../../src/hooks/useCommandPalette";
import type {
  CommandPaletteDispatchContextType,
  CommandPaletteItemsContextType,
  CommandPaletteStateContextType,
} from "../../src/contexts/CommandPaletteContext";
import { ROOT_COMMAND_SCOPE_ID } from "../../src/utils/commandScopeStore";
import { resolvePaletteItems } from "../../src/utils/paletteItems";

const navigateMock = vi.fn();
const addTabMock = vi.fn(() => "console-tab");

const databaseState: {
  activeConnectionId: string | null;
  activeDriver: string | null;
  activeDatabaseName: string | null;
  activeSchema: string | null;
} = {
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

vi.mock("../../src/hooks/useConnectionLayoutContext", () => ({
  useConnectionLayoutContext: () => ({
    explorerConnectionId: "connection-1",
    isSplitVisible: false,
    splitView: null,
  }),
}));

interface PaletteContexts {
  items: CommandPaletteItemsContextType;
  dispatch: CommandPaletteDispatchContextType;
  state: CommandPaletteStateContextType;
}

function ContextConsumer({
  onContexts,
}: {
  onContexts: (contexts: PaletteContexts) => void;
}) {
  const items = useCommandPaletteItems();
  const dispatch = useCommandPaletteDispatch();
  const state = useCommandPaletteState();
  onContexts({ items, dispatch, state });
  return null;
}

function PaletteTestHarness({
  onContexts,
}: {
  onContexts: (contexts: PaletteContexts) => void;
}) {
  const { activePalette } = useCommandPaletteState();

  return (
    <>
      <CommandPaletteScopeBridge scopeId={ROOT_COMMAND_SCOPE_ID} />
      {activePalette === "actions" ? (
        <CommandPaletteActionsProvider>
          <ContextConsumer onContexts={onContexts} />
        </CommandPaletteActionsProvider>
      ) : (
        <DispatchAndStateConsumer onContexts={onContexts} />
      )}
    </>
  );
}

function DispatchAndStateConsumer({
  onContexts,
}: {
  onContexts: (contexts: PaletteContexts) => void;
}) {
  const dispatch = useCommandPaletteDispatch();
  const state = useCommandPaletteState();
  onContexts({
    items: { items: [] },
    dispatch,
    state,
  });
  return null;
}

const DispatchConsumer = memo(function DispatchConsumer({
  onRender,
}: {
  onRender: () => void;
}) {
  useCommandPaletteDispatch();
  onRender();
  return null;
});

describe("CommandPaletteProvider", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    addTabMock.mockClear();
    databaseState.activeConnectionId = "connection-1";
  });

  it("should expose global and contextual built-in commands", () => {
    let palette: PaletteContexts | undefined;

    render(
      <CommandPaletteProvider>
        <PaletteTestHarness
          onContexts={(contexts) => {
            palette = contexts;
          }}
        />
      </CommandPaletteProvider>,
    );

    act(() => palette!.dispatch.openPalette("actions"));

    expect(
      resolvePaletteItems(palette!.items.items, "").map(
        (item) => item.id,
      ),
    ).toEqual([
      "table.open-in-console",
      "app.open-settings",
    ]);
  });

  it("should expose one explicit active palette state", () => {
    let palette: PaletteContexts | undefined;

    render(
      <CommandPaletteProvider>
        <PaletteTestHarness
          onContexts={(contexts) => {
            palette = contexts;
          }}
        />
      </CommandPaletteProvider>,
    );

    expect(palette!.state.activePalette).toBeNull();

    act(() => palette!.dispatch.openPalette("objects"));

    expect(palette!.state.activePalette).toBe("objects");
  });

  it("should keep object search closed without an active connection", () => {
    databaseState.activeConnectionId = null;
    let palette: PaletteContexts | undefined;

    render(
      <CommandPaletteProvider>
        <PaletteTestHarness
          onContexts={(contexts) => {
            palette = contexts;
          }}
        />
      </CommandPaletteProvider>,
    );

    act(() => palette!.dispatch.openPalette("objects"));

    expect(palette!.state.activePalette).toBeNull();
  });

  it("should open the current table in a new SQL console", async () => {
    let palette: PaletteContexts | undefined;

    render(
      <CommandPaletteProvider>
        <PaletteTestHarness
          onContexts={(contexts) => {
            palette = contexts;
          }}
        />
      </CommandPaletteProvider>,
    );

    act(() => palette!.dispatch.openPalette("actions"));

    const command = palette!.items.items.find(
      (item) => item.id === "table.open-in-console",
    );

    await act(async () => {
      await command!.primaryAction.execute();
    });

    expect(addTabMock).toHaveBeenCalledWith({
      type: "console",
      title: "users",
      query: 'SELECT * FROM "public"."users"',
      schema: "public",
    });
    expect(navigateMock).toHaveBeenCalledWith("/editor");
  });

  it("should not notify dispatch consumers when the active tab changes", () => {
    const onRender = vi.fn();
    const { rerender } = render(
      <CommandPaletteProvider>
        <DispatchConsumer onRender={onRender} />
      </CommandPaletteProvider>,
    );

    editorState.activeTab = {
      ...editorState.activeTab,
    };

    rerender(
      <CommandPaletteProvider>
        <DispatchConsumer onRender={onRender} />
      </CommandPaletteProvider>,
    );

    expect(onRender).toHaveBeenCalledTimes(1);
  });
});
