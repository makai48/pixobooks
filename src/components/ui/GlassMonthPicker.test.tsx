// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GlassMonthPicker from "./GlassMonthPicker";

/**
 * Billing periods and salary months used to be native `<input type="month">`
 * widgets. These tests pin the replacement: the month is a dropdown and the
 * year is a directly editable field, so no period is more than one edit away.
 */

beforeEach(() => {
  // jsdom has no canvas; the width-fit helper only needs a null context.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(cleanup);

describe("GlassMonthPicker", () => {
  it("shows the month and year of the current value", () => {
    render(
      <GlassMonthPicker value="2026-10" onChange={vi.fn()} ariaLabel="Billing period" />
    );

    expect(screen.getByRole("button", { name: "Billing period month" }).textContent).toContain(
      "Oct"
    );
    expect((screen.getByLabelText("Billing period year") as HTMLInputElement).value).toBe("2026");
  });

  it("keeps the year when the month changes", () => {
    const onChange = vi.fn();
    render(
      <GlassMonthPicker value="2026-10" onChange={onChange} ariaLabel="Billing period" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Billing period month" }));
    fireEvent.click(screen.getByRole("option", { name: "Feb" }));

    expect(onChange).toHaveBeenCalledWith("2026-02");
  });

  it("jumps to another year by typing it", () => {
    const onChange = vi.fn();
    render(
      <GlassMonthPicker value="2026-10" onChange={onChange} ariaLabel="Billing period" />
    );

    const year = screen.getByLabelText("Billing period year");
    fireEvent.change(year, { target: { value: "2019" } });
    fireEvent.blur(year);

    expect(onChange).toHaveBeenCalledWith("2019-10");
  });

  it("rejects an impossible year and restores the real one", () => {
    const onChange = vi.fn();
    render(
      <GlassMonthPicker value="2026-10" onChange={onChange} ariaLabel="Billing period" />
    );

    const year = screen.getByLabelText("Billing period year");
    fireEvent.change(year, { target: { value: "20026" } });
    fireEvent.blur(year);

    expect(onChange).not.toHaveBeenCalled();
    expect((year as HTMLInputElement).value).toBe("2026");
  });
});
