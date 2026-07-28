import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { DataGrid } from "../../../src/components/ui/DataGrid";

vi.mock("../../../src/hooks/useDatabase", () => ({
  useDatabase: () => ({ activeSchema: null, connections: [] }),
}));

vi.mock("../../../src/hooks/useAlert", () => ({
  useAlert: () => ({ showAlert: vi.fn() }),
}));

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock("../../../src/hooks/useToast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("../../../src/hooks/useSettings", () => ({
  useSettings: () => ({ settings: {} }),
}));

vi.mock("../../../src/hooks/useRightSidebar", () => ({
  useRightSidebar: () => ({
    isOpen: false,
    activePanel: null,
    rowEditorData: null,
    isPinned: false,
    openRowEditor: vi.fn(),
    updateRowEditorData: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
    setActivePanel: vi.fn(),
    togglePin: vi.fn(),
    onChangeRef: { current: null },
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// JSDOM has no layout, so the real virtualizer renders zero rows. Mock it to
// render every row — tests here assert behavior, not virtualization.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 35,
        end: (index + 1) * 35,
        size: 35,
      })),
    getTotalSize: () => count * 35,
  }),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

describe("DataGrid layout", () => {
  it("keeps hidden header tooltips out of scrollable overflow", () => {
    const { container } = render(
      <DataGrid
        columns={["id", "name"]}
        data={[[1, "Alice"]]}
        columnMetadata={[
          {
            name: "id",
            data_type: "integer",
            is_pk: true,
            is_nullable: false,
            is_auto_increment: false,
          },
          {
            name: "name",
            data_type: "character varying(255)",
            is_pk: false,
            is_nullable: false,
            is_auto_increment: false,
          },
        ]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        readonly
      />,
    );

    const table = container.querySelector("table");
    const tooltips = container.querySelectorAll('[role="tooltip"]');

    expect(table).toHaveClass("w-full");
    expect(tooltips).toHaveLength(2);
    expect(tooltips[0]).toHaveClass("hidden", "left-0");
    expect(tooltips[1]).toHaveClass("hidden", "right-0");
    expect(tooltips[1]).not.toHaveClass("left-0");
  });
});

describe("DataGrid select all", () => {
  const columns = ["id", "name"];
  const data: unknown[][] = [
    [1, "Alice"],
    [2, "Bob"],
  ];

  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    showToastMock.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("selects all loaded rows with Cmd/Ctrl+A without copying", () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <DataGrid
        columns={columns}
        data={data}
        selectedRows={new Set()}
        onSelectionChange={onSelectionChange}
        readonly
      />,
    );

    fireEvent.mouseDown(container.querySelector("table")!);
    fireEvent.keyDown(document, { key: "a", metaKey: true });

    expect(onSelectionChange).toHaveBeenCalledWith(new Set([0, 1]));
    // Selecting never touches the clipboard — copying is a separate action.
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the selected rows with Cmd/Ctrl+C", async () => {
    const Harness = () => {
      const [selected, setSelected] = useState<Set<number>>(new Set());
      return (
        <DataGrid
          columns={columns}
          data={data}
          selectedRows={selected}
          onSelectionChange={setSelected}
          readonly
        />
      );
    };
    const { container } = render(<Harness />);

    fireEvent.mouseDown(container.querySelector("table")!);
    fireEvent.keyDown(document, { key: "a", metaKey: true });
    fireEvent.keyDown(document, { key: "c", metaKey: true });

    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls[0][0]).toContain("Alice");
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("dataGrid.copiedRows", {
        kind: "success",
      }),
    );
  });

  it("ignores Cmd/Ctrl+A when the grid was not interacted with", () => {
    const onSelectionChange = vi.fn();
    render(
      <DataGrid
        columns={columns}
        data={data}
        selectedRows={new Set()}
        onSelectionChange={onSelectionChange}
        readonly
      />,
    );

    fireEvent.keyDown(document, { key: "a", metaKey: true });

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("ignores Cmd/Ctrl+A coming from editable targets", () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <>
        <input data-testid="external-input" />
        <DataGrid
          columns={columns}
          data={data}
          selectedRows={new Set()}
          onSelectionChange={onSelectionChange}
          readonly
        />
      </>,
    );

    fireEvent.mouseDown(container.querySelector("table")!);
    fireEvent.keyDown(screen.getByTestId("external-input"), {
      key: "a",
      metaKey: true,
    });

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("toggles select all via the # header cell", () => {
    const calls: Set<number>[] = [];
    const Harness = () => {
      const [selected, setSelected] = useState<Set<number>>(new Set());
      return (
        <DataGrid
          columns={columns}
          data={data}
          selectedRows={selected}
          onSelectionChange={(next: Set<number>) => {
            calls.push(next);
            setSelected(next);
          }}
          readonly
        />
      );
    };
    const { container } = render(<Harness />);

    const headerCell = container.querySelector("th")!;
    fireEvent.click(headerCell);
    expect(calls[0]).toEqual(new Set([0, 1]));

    fireEvent.click(headerCell);
    expect(calls[1]).toEqual(new Set());
  });

  it("offers Select All in the row context menu", async () => {
    const onSelectionChange = vi.fn();
    render(
      <DataGrid
        columns={columns}
        data={data}
        tableName="users"
        selectedRows={new Set()}
        onSelectionChange={onSelectionChange}
        readonly
      />,
    );

    fireEvent.contextMenu(screen.getByText("Alice"));

    const item = await screen.findByText("dataGrid.selectAll");
    fireEvent.click(item);

    expect(onSelectionChange).toHaveBeenCalledWith(new Set([0, 1]));
  });

  it("asks before copying a full-page selection beyond the loaded page", async () => {
    const onCopyAllRows = vi.fn();
    const Harness = () => {
      const [selected, setSelected] = useState<Set<number>>(new Set());
      return (
        <DataGrid
          columns={columns}
          data={data}
          selectedRows={selected}
          onSelectionChange={setSelected}
          totalRows={10}
          onCopyAllRows={onCopyAllRows}
          readonly
        />
      );
    };
    const { container } = render(<Harness />);

    fireEvent.mouseDown(container.querySelector("table")!);
    fireEvent.keyDown(document, { key: "a", metaKey: true });

    // Selecting alone never opens the dialog or touches the clipboard.
    expect(screen.queryByText("dataGrid.copyAllRowsTitle")).toBeNull();
    expect(writeText).not.toHaveBeenCalled();

    // Copying a selection that covers the whole loaded page does.
    fireEvent.keyDown(document, { key: "c", metaKey: true });
    await screen.findByText("dataGrid.copyAllRowsTitle");
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("dataGrid.copyAllRowsConfirm"));

    expect(onCopyAllRows).toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies only the loaded rows when the copy-all dialog is cancelled", async () => {
    const onCopyAllRows = vi.fn();
    const Harness = () => {
      const [selected, setSelected] = useState<Set<number>>(new Set());
      return (
        <DataGrid
          columns={columns}
          data={data}
          selectedRows={selected}
          onSelectionChange={setSelected}
          totalRows={10}
          onCopyAllRows={onCopyAllRows}
          readonly
        />
      );
    };
    const { container } = render(<Harness />);

    fireEvent.mouseDown(container.querySelector("table")!);
    fireEvent.keyDown(document, { key: "a", metaKey: true });
    fireEvent.keyDown(document, { key: "c", metaKey: true });

    await screen.findByText("dataGrid.copyAllRowsTitle");
    fireEvent.click(screen.getByText("common.cancel"));

    expect(onCopyAllRows).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls[0][0]).toContain("Alice");
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("dataGrid.copiedRows", {
        kind: "success",
      }),
    );
  });
});
