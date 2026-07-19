import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickNavigatorModal } from "../../../src/components/modals/QuickNavigatorModal";

const onClose = vi.fn();

vi.mock("../../../src/hooks/useAlert", () => ({
  useAlert: () => ({ showAlert: vi.fn() }),
}));

vi.mock("../../../src/hooks/useDatabase", () => ({
  useDatabase: () => ({
    activeConnectionId: "connection-1",
    activeDriver: "postgres",
    activeCapabilities: {},
    tables: [],
    views: [],
    routines: [],
    triggers: [],
    schemaDataMap: {},
    databaseDataMap: {},
    activeSchema: null,
    setActiveTable: vi.fn(),
    schemas: [],
    loadSchemaData: vi.fn(),
    loadDatabaseData: vi.fn(),
    connections: [],
  }),
}));

describe("QuickNavigatorModal", () => {
  beforeEach(() => onClose.mockClear());

  it("should expose a focused search dialog and close with Escape", () => {
    render(
      <MemoryRouter>
        <QuickNavigatorModal isOpen onClose={onClose} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const input = screen.getByRole("combobox");
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
