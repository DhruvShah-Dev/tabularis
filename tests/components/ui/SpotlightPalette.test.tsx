import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "../../../src/components/ui/Modal";
import { SpotlightPalette } from "../../../src/components/ui/SpotlightPalette";

function renderPalette(itemCount = 2, selectedIndex = 0) {
  const onClose = vi.fn();
  const onQueryChange = vi.fn();
  const onSelectedIndexChange = vi.fn();
  const onSubmit = vi.fn();

  render(
    <SpotlightPalette
      ariaLabel="Palette"
      searchLabel="Search"
      closeLabel="Close"
      placeholder="Type to search"
      query=""
      itemCount={itemCount}
      selectedIndex={selectedIndex}
      onClose={onClose}
      onQueryChange={onQueryChange}
      onSelectedIndexChange={onSelectedIndexChange}
      onSubmit={onSubmit}
      resultsId="palette-results"
      footer={<span>Keyboard help</span>}
    >
      <div>Results</div>
    </SpotlightPalette>,
  );

  return {
    onClose,
    onQueryChange,
    onSelectedIndexChange,
    onSubmit,
  };
}

describe("SpotlightPalette", () => {
  it("should autofocus its search input and expose dialog semantics", () => {
    renderPalette();

    expect(screen.getByRole("dialog", { name: "Palette" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search" })).toHaveFocus();
  });

  it("should reset selection when the query changes", () => {
    const { onQueryChange, onSelectedIndexChange } = renderPalette();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "users" },
    });

    expect(onQueryChange).toHaveBeenCalledWith("users");
    expect(onSelectedIndexChange).toHaveBeenCalledWith(0);
  });

  it("should wrap keyboard navigation and submit the active item", () => {
    const { onSelectedIndexChange, onSubmit } = renderPalette(2, 1);
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelectedIndexChange).toHaveBeenNthCalledWith(1, 0);
    expect(onSelectedIndexChange).toHaveBeenNthCalledWith(2, 0);
    expect(onSubmit).toHaveBeenCalledWith(1);
  });

  it("should close with Escape and a backdrop press", () => {
    const { onClose } = renderPalette();
    const dialog = screen.getByRole("dialog");

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement!);

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("should close only the palette when it is stacked above another modal", () => {
    const lowerModalClose = vi.fn();
    const paletteClose = vi.fn();

    render(
      <>
        <Modal isOpen onClose={lowerModalClose}>
          <div>Lower modal</div>
        </Modal>
        <SpotlightPalette
          ariaLabel="Palette"
          searchLabel="Search"
          closeLabel="Close"
          placeholder="Type to search"
          query=""
          itemCount={0}
          selectedIndex={0}
          onClose={paletteClose}
          onQueryChange={vi.fn()}
          onSelectedIndexChange={vi.fn()}
          onSubmit={vi.fn()}
          resultsId="palette-results"
          footer={<span>Keyboard help</span>}
        >
          <div>Results</div>
        </SpotlightPalette>
      </>,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), {
      key: "Escape",
    });

    expect(paletteClose).toHaveBeenCalledOnce();
    expect(lowerModalClose).not.toHaveBeenCalled();
  });
});
