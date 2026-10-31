// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The delete control is only useful if the button is actually visible and the
 * confirmation gate is obvious. The first version styled `.btn-danger` with
 * `hsl(var(--danger))`, but `.st` defines `--danger` as a hex token — the
 * invalid declaration made the button white-on-white, so it looked missing.
 * These tests pin the rendered control, not the styling internals.
 */

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      delete: () => ({ eq: async () => ({ error: null, count: 0 }) }),
      update: () => ({ eq: async () => ({ error: null, count: 0 }) }),
    }),
  },
}));
vi.mock("@/lib/tenant", () => ({ currentBusinessId: () => "biz-1" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/appQueryClient", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/lib/queryPersist", () => ({
  clearPersistedSnapshots: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const { default: WipeDataPanel } = await import("./WipeDataPanel");

afterEach(cleanup);

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: /delete all app data/i }));
}

describe("WipeDataPanel", () => {
  it("renders the scope dropdown and a delete button beside it", () => {
    render(<WipeDataPanel />);

    expect(screen.getByLabelText("Data to delete")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /delete all app data/i })
    ).toBeTruthy();
  });

  it("keeps the final delete disabled until the exact phrase is typed", () => {
    render(<WipeDataPanel />);
    openConfirm();

    const input = screen.getByLabelText(
      /type wipe all to confirm/i
    ) as HTMLInputElement;
    const confirm = screen.getByRole("button", {
      name: /delete permanently/i,
    }) as HTMLButtonElement;

    expect(confirm.disabled).toBe(true);

    // "WIPE" is not enough for the all-data scope.
    fireEvent.change(input, { target: { value: "WIPE" } });
    expect(confirm.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "WIPE ALL" } });
    expect(confirm.disabled).toBe(false);
  });

  it("disables the button for a derived dataset with nothing stored", () => {
    render(<WipeDataPanel />);

    fireEvent.click(screen.getByLabelText("Data to delete"));
    fireEvent.click(screen.getByRole("option", { name: "Statistics" }));

    const button = screen.getByRole("button", {
      name: /delete statistics/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
