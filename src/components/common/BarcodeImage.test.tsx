// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import BarcodeImage from "./BarcodeImage";

afterEach(cleanup);

describe("BarcodeImage", () => {
  it("renders a real vector barcode from an EAN-13 value", async () => {
    const { container } = render(
      <BarcodeImage value="1234567890128" format="EAN_13" />
    );
    await waitFor(() => {
      expect(container.querySelector("svg rect")).toBeTruthy();
    });
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 /);
    expect(svg.getAttribute("width")).toBeNull();
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("falls back to Code 128 when the declared symbology cannot encode the value", async () => {
    const { container } = render(
      <BarcodeImage value="ABC-12345" format="EAN_13" />
    );
    await waitFor(() => {
      expect(container.querySelector("svg rect")).toBeTruthy();
    });
  });

  it("prints the scanned value beneath the bars when requested", async () => {
    // JsBarcode measures the label with a canvas context, which jsdom lacks.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(
        () =>
          ({
            font: "",
            measureText: (text: string) => ({ width: text.length * 8 }),
          }) as unknown as CanvasRenderingContext2D
      );

    const { container } = render(
      <BarcodeImage
        value="1234567890128"
        format="EAN_13"
        displayValue
      />
    );
    await waitFor(() => {
      expect(container.querySelector("svg text")).toBeTruthy();
    });
    expect(container.textContent).toContain("1234567890128");
    getContext.mockRestore();
  });
});
