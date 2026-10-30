// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import GlassDatePicker from "./GlassDatePicker";

/**
 * The calendar header used to be a static "October 2026" label, so reaching a
 * different year meant clicking the arrows twelve times per year. These tests
 * pin the direct month/year controls: pick the month from the dropdown, type
 * the year, click the day.
 */

beforeEach(() => {
  // jsdom has no canvas; the width-fit helper only needs a null context.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(cleanup);

function openCalendar(value = "2026-10-29") {
  const onChange = vi.fn();
  render(<GlassDatePicker value={value} onChange={onChange} ariaLabel="Test date" />);
  fireEvent.click(screen.getByRole("button", { name: "Test date" }));
  return { onChange, dialog: screen.getByRole("dialog", { name: "Test date" }) };
}

describe("GlassDatePicker month/year navigation", () => {
  it("starts on the month and year of the current value", () => {
    const { dialog } = openCalendar();

    const month = within(dialog).getByLabelText("Test date month") as HTMLSelectElement;
    const year = within(dialog).getByLabelText("Test date year") as HTMLInputElement;

    expect(month.value).toBe("9"); // October (0-based)
    expect(year.value).toBe("2026");
  });

  it("jumps to another month in one change", () => {
    const { onChange, dialog } = openCalendar();

    fireEvent.change(within(dialog).getByLabelText("Test date month"), {
      target: { value: "2" }, // March
    });
    fireEvent.click(within(dialog).getByText("15"));

    expect(onChange).toHaveBeenCalledWith("2026-03-15");
  });

  it("jumps to another year by typing it", () => {
    const { onChange, dialog } = openCalendar();

    fireEvent.change(within(dialog).getByLabelText("Test date month"), {
      target: { value: "2" },
    });
    const year = within(dialog).getByLabelText("Test date year");
    fireEvent.change(year, { target: { value: "2019" } });
    fireEvent.blur(year);
    fireEvent.click(within(dialog).getByText("15"));

    expect(onChange).toHaveBeenCalledWith("2019-03-15");
  });

  it("ignores an impossible year instead of breaking the calendar", () => {
    const { onChange, dialog } = openCalendar();

    const year = within(dialog).getByLabelText("Test date year");
    fireEvent.change(year, { target: { value: "20026" } });
    fireEvent.blur(year);
    fireEvent.click(within(dialog).getByText("15"));

    // Still October 2026 — the typo is rejected, not applied.
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
    expect((year as HTMLInputElement).value).toBe("2026");
  });

  it("shows a placeholder for an empty optional date", () => {
    render(
      <GlassDatePicker
        value=""
        onChange={vi.fn()}
        ariaLabel="Optional date"
        placeholder="No expiry"
      />
    );

    // Never "01 Jan 1970" — an empty optional date reads as empty.
    expect(screen.getByRole("button", { name: "Optional date" }).textContent).toContain(
      "No expiry"
    );
  });

  it("clears an optional date back to empty", () => {
    const onChange = vi.fn();
    render(
      <GlassDatePicker
        value="2026-10-29"
        onChange={onChange}
        ariaLabel="Optional date"
        placeholder="No expiry"
        allowClear
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Optional date" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
