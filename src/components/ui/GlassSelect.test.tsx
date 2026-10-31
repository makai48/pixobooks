// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GlassSelect from "./GlassSelect";

const MANY = [
  "All clients",
  "Amelia Stone",
  "Brian Okello",
  "Cathy Nakato",
  "David Ssemakula",
  "Esther Auma",
  "Faith Namono",
  "George Kato",
];

const FEW = ["Cash", "Card", "Wire"];

beforeEachOpen();
function beforeEachOpen() {
  // jsdom has no canvas; the width-fit helper only needs a null context.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
}

afterEach(cleanup);

function openMany(value = "") {
  const onChange = vi.fn();
  render(
    <GlassSelect
      value={value}
      onChange={onChange}
      ariaLabel="Client"
      options={MANY.map((label) => ({ value: label, label }))}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Client" }));
  return { onChange };
}

describe("GlassSelect type-to-search", () => {
  it("shows a search box for long lists and filters as you type", () => {
    openMany();
    const box = screen.getByPlaceholderText("Type to search...");
    expect(box).toBeTruthy();
    fireEvent.change(box, { target: { value: "cathy" } });
    expect(screen.getByRole("option", { name: "Cathy Nakato" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Brian Okello" })).toBeNull();
  });

  it("Enter picks the highlighted match", () => {
    const { onChange } = openMany();
    fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
      target: { value: "george" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Type to search..."), {
      key: "Enter",
    });
    expect(onChange).toHaveBeenCalledWith("George Kato");
  });

  it("shows a no-matches row instead of an empty popup", () => {
    openMany();
    fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
      target: { value: "zzz-no-such-client" },
    });
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("skips the search box for short lists", () => {
    render(
      <GlassSelect
        value="cash"
        onChange={() => {}}
        ariaLabel="Method"
        options={FEW.map((label) => ({ value: label.toLowerCase(), label }))}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Method" }));
    expect(screen.queryByPlaceholderText("Type to search...")).toBeNull();
    expect(screen.getByRole("option", { name: "Wire" })).toBeTruthy();
  });
});
