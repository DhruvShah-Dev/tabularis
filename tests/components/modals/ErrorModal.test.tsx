import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorModal } from "../../../src/components/modals/ErrorModal";

describe("ErrorModal", () => {
  it("renders selectable error text and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <ErrorModal
        isOpen
        onClose={vi.fn()}
        message={"Query failed\nUnknown column payment_status"}
      />,
    );

    const errorText = screen.getByText(/Unknown column payment_status/);
    expect(errorText).toHaveClass("select-text");

    fireEvent.click(screen.getByRole("button", { name: /common.copy/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Query failed\nUnknown column payment_status");
    });
  });
});
