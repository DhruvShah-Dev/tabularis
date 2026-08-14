import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { getDriverIcon, getConnectionIcon } from "../../src/utils/driverUI";
import type { PluginManifest } from "../../src/types/plugins";
import type { SavedConnection } from "../../src/contexts/DatabaseContext";

/**
 * getDriverIcon's priority is documented as: manifest-supplied URL/data:
 * URI icon -> brand SVG icon -> lucide icon -> generic fallback (issue
 * #632). getConnectionIcon layers a per-connection override on top of that,
 * for the full 3-tier priority @debba specified: Connection Custom Icon >
 * Manifest Icon (if present) > Plugin Icon.
 */
describe("getDriverIcon", () => {
  const manifest = (icon?: string): PluginManifest =>
    ({ icon } as PluginManifest);

  const renderIcon = (icon?: string, size = 14) =>
    render(<div data-testid="wrap">{getDriverIcon(manifest(icon), size)}</div>);

  it("renders a registry <img> for an https:// manifest icon", () => {
    const { getByTestId } = renderIcon("https://example.com/icon.svg");
    const img = getByTestId("wrap").querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/icon.svg");
  });

  it("renders a registry <img> for a data: URI manifest icon", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    const { getByTestId } = renderIcon(dataUri);
    const img = getByTestId("wrap").querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(dataUri);
  });

  it("still renders the built-in Postgres brand icon for the literal string 'postgres'", () => {
    const { getByTestId } = renderIcon("postgres");
    expect(getByTestId("wrap").querySelector("svg")).not.toBeNull();
    expect(getByTestId("wrap").querySelector("img")).toBeNull();
  });

  it("still falls through to the legacy lucide branch (not the URL branch) for the literal string 'database'", () => {
    // lucide-react icons are globally mocked to render null in this test
    // environment (see tests/setup.ts), so we can't distinguish *which*
    // lucide icon rendered by inspecting the DOM — but we CAN confirm it
    // didn't take the new URL/data: branch (no <img>) and isn't one of the
    // hand-written brand SVGs (no real <svg>, since those aren't mocked).
    const { getByTestId } = renderIcon("database");
    expect(getByTestId("wrap").querySelector("img")).toBeNull();
    expect(getByTestId("wrap").querySelector("svg")).toBeNull();
  });

  it("falls back to the generic Plug branch for an unrecognized non-URL string", () => {
    const { getByTestId } = renderIcon("some-random-value");
    expect(getByTestId("wrap").querySelector("img")).toBeNull();
    expect(getByTestId("wrap").querySelector("svg")).toBeNull();
  });

  it("falls back to the generic Plug branch when no icon is set at all", () => {
    const { getByTestId } = renderIcon(undefined);
    expect(getByTestId("wrap").querySelector("img")).toBeNull();
    expect(getByTestId("wrap").querySelector("svg")).toBeNull();
  });
});

describe("getConnectionIcon", () => {
  const manifest = (icon?: string): PluginManifest => ({ icon } as PluginManifest);
  const connection = (
    icon?: SavedConnection["appearance"] extends { icon?: infer T } ? T : never,
  ): Pick<SavedConnection, "appearance"> => (icon ? { appearance: { icon } } : {});

  const renderConnectionIcon = (
    conn: Pick<SavedConnection, "appearance">,
    icon?: string,
    size = 14,
  ) =>
    render(
      <div data-testid="wrap">{getConnectionIcon(conn, manifest(icon), size)}</div>,
    );

  it("prefers a Connection Custom Icon (emoji override) over a URL manifest icon", () => {
    const { getByTestId } = renderConnectionIcon(
      connection({ type: "emoji", value: "🐘" }),
      "https://example.com/icon.svg",
    );
    expect(getByTestId("wrap").textContent).toBe("🐘");
    expect(getByTestId("wrap").querySelector("img")).toBeNull();
  });

  it("falls back to the Manifest Icon (URL) when there is no connection override", () => {
    const { getByTestId } = renderConnectionIcon(
      connection(undefined),
      "https://example.com/icon.svg",
    );
    const img = getByTestId("wrap").querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/icon.svg");
  });

  it("falls back to the Plugin Icon (built-in brand icon) when there is neither a connection override nor a manifest icon URL", () => {
    const { getByTestId } = renderConnectionIcon(connection(undefined), "postgres");
    expect(getByTestId("wrap").querySelector("svg")).not.toBeNull();
    expect(getByTestId("wrap").querySelector("img")).toBeNull();
  });
});
