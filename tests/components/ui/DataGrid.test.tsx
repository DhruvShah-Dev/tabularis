import { fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";
import { DataGrid } from "../../../src/components/ui/DataGrid";
import {
  buildPkMap,
  serializePkKey,
  USE_DEFAULT_SENTINEL,
} from "../../../src/utils/dataGrid";

vi.mock("../../../src/hooks/useDatabase", () => ({
  useDatabase: () => ({ activeSchema: null, connections: [] }),
}));

vi.mock("../../../src/hooks/useAlert", () => ({
  useAlert: () => ({ showAlert: vi.fn() }),
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

describe("DataGrid keyboard navigation", () => {
  // The row virtualizer sizes its viewport from offsetWidth/offsetHeight, which
  // JSDOM always reports as zero — without a height no rows would be rendered.
  beforeAll(() => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  const renderGrid = () =>
    render(
      <DataGrid
        columns={["id", "name"]}
        data={[
          [1, "Alice"],
          [2, "Bob"],
          [3, "Carol"],
        ]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        readonly
      />,
    );

  const cellAt = (container: HTMLElement, rowIndex: number, colIndex: number) =>
    container.querySelector(
      `tr[data-row-index="${rowIndex}"] td[data-col-index="${colIndex}"]`,
    )!;

  const gridOf = (container: HTMLElement) =>
    container.querySelector('div[tabindex="0"]')!;

  it("focuses the first cell on the first arrow key press", () => {
    const { container } = renderGrid();

    fireEvent.keyDown(gridOf(container), { key: "ArrowDown" });

    expect(cellAt(container, 0, 0)).toHaveClass("ring-2");
  });

  it("focuses the grid container on cell click so key events reach it", () => {
    const { container } = renderGrid();

    fireEvent.click(cellAt(container, 0, 0));

    expect(gridOf(container)).toHaveFocus();
  });

  it("moves the focused cell with the arrow keys", () => {
    const { container } = renderGrid();

    fireEvent.click(cellAt(container, 0, 0));
    fireEvent.keyDown(gridOf(container), { key: "ArrowDown" });
    fireEvent.keyDown(gridOf(container), { key: "ArrowRight" });

    expect(cellAt(container, 1, 1)).toHaveClass("ring-2");
    expect(cellAt(container, 0, 0)).not.toHaveClass("ring-2");
  });

  it("clamps navigation at the grid edges", () => {
    const { container } = renderGrid();

    fireEvent.click(cellAt(container, 0, 0));
    fireEvent.keyDown(gridOf(container), { key: "ArrowUp" });
    fireEvent.keyDown(gridOf(container), { key: "ArrowLeft" });

    expect(cellAt(container, 0, 0)).toHaveClass("ring-2");
  });

  it("jumps to the row edges with Home and End", () => {
    const { container } = renderGrid();

    fireEvent.click(cellAt(container, 1, 0));
    fireEvent.keyDown(gridOf(container), { key: "End" });
    expect(cellAt(container, 1, 1)).toHaveClass("ring-2");

    fireEvent.keyDown(gridOf(container), { key: "Home" });
    expect(cellAt(container, 1, 0)).toHaveClass("ring-2");
  });

  it("ignores navigation keys while a modifier is held", () => {
    const { container } = renderGrid();

    fireEvent.click(cellAt(container, 0, 0));
    fireEvent.keyDown(gridOf(container), { key: "ArrowDown", metaKey: true });

    expect(cellAt(container, 0, 0)).toHaveClass("ring-2");
  });

  it("leaves keys to focusable controls inside the grid", () => {
    const { container } = render(
      <DataGrid
        columns={["id", "name"]}
        data={[
          [1, "Alice"],
          [2, "Bob"],
        ]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        onSort={vi.fn()}
        readonly
      />,
    );

    fireEvent.click(cellAt(container, 0, 0));
    fireEvent.keyDown(container.querySelector('[role="button"]')!, {
      key: "ArrowDown",
    });

    expect(cellAt(container, 0, 0)).toHaveClass("ring-2");
  });
});

describe("DataGrid keyboard editing", () => {
  beforeAll(() => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  const cellAt = (container: HTMLElement, rowIndex: number, colIndex: number) =>
    container.querySelector(
      `tr[data-row-index="${rowIndex}"] td[data-col-index="${colIndex}"]`,
    )!;

  const gridOf = (container: HTMLElement) =>
    container.querySelector('div[tabindex="0"]')!;

  const renderEditableGrid = (
    pendingChanges?: Record<
      string,
      { pkOriginalValue: unknown; changes: Record<string, unknown> }
    >,
  ) =>
    render(
      <DataGrid
        columns={["id", "name"]}
        data={[
          [1, "Alice"],
          [2, "Bob"],
        ]}
        tableName="users"
        pkColumns={["id"]}
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
            is_nullable: true,
            is_auto_increment: false,
          },
        ]}
        pendingChanges={pendingChanges}
        onPendingChange={vi.fn()}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );

  it("opens the editor on Enter and returns focus to the grid on Escape", () => {
    const { container } = renderEditableGrid();

    fireEvent.click(cellAt(container, 0, 1));
    fireEvent.keyDown(gridOf(container), { key: "Enter" });

    const editor = container.querySelector("textarea")!;
    expect(editor).toBeInTheDocument();

    fireEvent.keyDown(editor, { key: "Escape" });

    expect(container.querySelector("textarea")).toBeNull();
    expect(gridOf(container)).toHaveFocus();
  });

  it("opens an empty editor for a cell pending the database DEFAULT", () => {
    const pkVal = serializePkKey(buildPkMap(["id"], [1, "Alice"], [0]));
    const { container } = renderEditableGrid({
      [pkVal]: {
        pkOriginalValue: 1,
        changes: { name: USE_DEFAULT_SENTINEL },
      },
    });

    fireEvent.click(cellAt(container, 0, 1));
    fireEvent.keyDown(gridOf(container), { key: "Enter" });

    expect(container.querySelector("textarea")).toHaveValue("");
  });
});
