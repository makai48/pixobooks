// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import BarcodeScanButton from "./BarcodeScanButton";

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromStream(
      _stream: unknown,
      _video: unknown,
      callback: (result: { getText: () => string }) => void
    ) {
      queueMicrotask(() => callback({ getText: () => "1234567890128" }));
      return Promise.resolve({ stop: () => undefined });
    }
  },
}));

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: () => undefined }],
      }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BarcodeScanButton", () => {
  it("renders a labelled scanner control", () => {
    render(<BarcodeScanButton onScan={() => undefined} />);
    expect(
      screen.getByRole("button", { name: /scan barcode/i })
    ).toBeTruthy();
  });

  it("opens the scanner dialog", () => {
    render(<BarcodeScanButton onScan={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /scan barcode/i }));
    expect(screen.getByRole("dialog", { name: /scan barcode/i })).toBeTruthy();
    expect(screen.getByText("Scan a code")).toBeTruthy();
  });

  it("offers an image-upload fallback", () => {
    render(<BarcodeScanButton onScan={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /scan barcode/i }));
    expect(screen.getByRole("button", { name: /upload image/i })).toBeTruthy();
  });

  it("no longer asks for a manually typed barcode", () => {
    const onScan = vi.fn();
    render(<BarcodeScanButton onScan={onScan} />);
    fireEvent.click(screen.getByRole("button", { name: /scan barcode/i }));
    expect(screen.queryByLabelText("Barcode value")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onScan).not.toHaveBeenCalled();
  });

  it("closes on the close control", () => {
    render(<BarcodeScanButton onScan={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /scan barcode/i }));
    fireEvent.click(screen.getByRole("button", { name: /close scanner/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applies a decoded barcode automatically after the success hold", async () => {
    vi.useFakeTimers();
    const onScan = vi.fn();
    render(<BarcodeScanButton onScan={onScan} />);
    fireEvent.click(screen.getByRole("button", { name: /scan barcode/i }));

    await vi.advanceTimersByTimeAsync(50);
    expect(screen.getByText("Barcode Scanned Successfully")).toBeTruthy();
    expect(onScan).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1300);
    expect(onScan).toHaveBeenCalledWith("1234567890128");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
