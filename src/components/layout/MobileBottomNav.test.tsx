// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MobileBottomNav from "./MobileBottomNav";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: () => true }) }));

afterEach(cleanup);

function renderNav(initialPath = "/") {
  const onOpenMore = vi.fn();
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MobileBottomNav onOpenMore={onOpenMore} />
    </MemoryRouter>
  );
  return onOpenMore;
}

describe("MobileBottomNav", () => {
  it("renders the design tabs in POS, Sales, Expenses, Inventory order", () => {
    renderNav();
    expect(screen.getAllByRole("link").map((link) => link.textContent?.trim())).toEqual([
      "POS",
      "Sales",
      "Expenses",
      "Inventory",
    ]);
  });

  it("marks the current route as active", () => {
    renderNav("/expenses");
    expect(screen.getByRole("link", { name: "Expenses" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.getByRole("link", { name: "POS" }).getAttribute("aria-current")).toBeNull();
  });

  it("routes the three-dot button to the app's More drawer", () => {
    const onOpenMore = renderNav();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onOpenMore).toHaveBeenCalledTimes(1);
  });
});
