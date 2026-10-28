// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { resetImportJob } from "@/lib/importJob";

/**
 * Regression coverage for a real bug: the modal cleared the file input's
 * `value` (so the same file could be re-picked) but then read the selected
 * file back from `input.files` when Start was pressed. Clearing `value` also
 * empties `files`, so Start always failed with "Choose a JSON file first".
 *
 * These tests drive the real DOM file-picker semantics, so they fail against
 * the old implementation and pass against the state-backed one.
 */

const importData = vi.fn(async () => ({
  category: "customers",
  results: [
    { table: "customers", inserted: 2, updated: 0, errors: [], warnings: [] },
  ],
  totalInserted: 2,
  totalUpdated: 0,
  totalErrors: 0,
  totalWarnings: 0,
}));

const parseImportFile = vi.fn();
const detectImportCategory = vi.fn(() => null);
const countImportRows = vi.fn(() => 2);

vi.mock("@/lib/import", () => ({
  IMPORT_CATEGORIES: [
    { key: "sales", label: "Sales", description: "" },
    { key: "customers", label: "Customers", description: "" },
  ],
  parseImportFile: (...a: Parameters<typeof parseImportFile>) => parseImportFile(...a),
  detectImportCategory: (...a: Parameters<typeof detectImportCategory>) =>
    detectImportCategory(...a),
  countImportRows: (...a: Parameters<typeof countImportRows>) => countImportRows(...a),
  importData: (...a: Parameters<typeof importData>) => importData(...a),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { default: ImportDataModal } = await import("./ImportDataModal");

function makeFile(name: string, body: string) {
  return new File([body], name, { type: "application/json" });
}

const exportJson = JSON.stringify({
  exportedAt: new Date().toISOString(),
  category: "customers",
  count: 2,
  rows: [
    { id: "c1", name: "Alice" },
    { id: "c2", name: "Bob" },
  ],
});

function renderModal() {
  return render(
    <ImportDataModal open={true} onClose={() => {}} actor={{ id: "u1", name: "Owner" }} />
  );
}

/** Fire a file-picker change, then emulate the real-browser quirk that caused
 *  the bug: clearing `input.value` (so the same file can be re-picked) also
 *  empties `input.files`. jsdom does NOT reproduce this on its own, so we do it
 *  by hand — otherwise these tests pass even against the broken code. */
function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  // Assign a FileList directly (jsdom supports this even without DataTransfer).
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file] as unknown as FileList,
  });
  fireEvent.change(input);
  // What the modal's onChange does to every file input.
  input.value = "";
  // A real browser now reports an empty FileList. Emulate that so a
  // `input.files`-based implementation fails here.
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [] as unknown as FileList,
  });
  return input;
}

/** Scope the Start button to this render so queries can't match a previous one. */
function startButton(container: HTMLElement): HTMLButtonElement {
  const btns = Array.from(container.querySelectorAll("button")).filter((b) =>
    /start import/i.test(b.textContent || "")
  );
  expect(btns).toHaveLength(1);
  return btns[0] as HTMLButtonElement;
}

describe("ImportDataModal file selection", () => {
  beforeEach(() => {
    cleanup();
    resetImportJob();
    importData.mockClear();
    parseImportFile.mockReset();
    detectImportCategory.mockReset();
    countImportRows.mockReset();
    parseImportFile.mockResolvedValue({ exportedAt: "x", category: "customers", rows: [{}, {}] });
    detectImportCategory.mockReturnValue(null);
    countImportRows.mockReturnValue(2);
  });

  afterEach(cleanup);

  it("imports after a file is chosen, without complaining about a missing file", async () => {
    const { container } = renderModal();

    selectFile(container, makeFile("export.json", exportJson));
    await waitFor(() => expect(countImportRows).toHaveBeenCalledTimes(1));

    fireEvent.click(startButton(container));

    await waitFor(() => expect(importData).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // The old bug surfaced this exact message.
    expect(container.textContent).not.toMatch(/choose a json file first/i);
  });

  it("keeps the selection when the same file is picked twice", async () => {
    const { container } = renderModal();

    // Picking the same file twice must still fire a change event and keep
    // the modal able to import.
    selectFile(container, makeFile("export.json", exportJson));
    await waitFor(() => expect(countImportRows).toHaveBeenCalledTimes(1));

    selectFile(container, makeFile("export.json", exportJson));
    await waitFor(() => expect(countImportRows).toHaveBeenCalledTimes(2));

    fireEvent.click(startButton(container));
    await waitFor(() => expect(importData).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("disables Start until a file is chosen", () => {
    const { container } = renderModal();
    expect(startButton(container).disabled).toBe(true);
  });

  it("runs the import with the parsed payload and a progress callback", async () => {
    const { container } = renderModal();
    selectFile(container, makeFile("export.json", exportJson));
    await waitFor(() => expect(countImportRows).toHaveBeenCalledTimes(1));

    fireEvent.click(startButton(container));

    await waitFor(() => expect(importData).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const args = importData.mock.calls[0] as unknown[];
    // Detection is mocked to null, so the dropdown's value is used as-is.
    expect(args[0]).toBe("sales");
    expect(typeof args[3]).toBe("function");
  });

  it("keeps the result after the screen unmounts and mounts again", async () => {
    const first = renderModal();
    selectFile(first.container, makeFile("export.json", exportJson));
    await waitFor(() => expect(countImportRows).toHaveBeenCalledTimes(1));

    fireEvent.click(startButton(first.container));
    await waitFor(() => expect(importData).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await waitFor(() => expect(first.container.textContent).toMatch(/import finished/i));

    // Leaving Settings unmounts the panel; the job lives in the store.
    first.unmount();

    const second = renderModal();
    expect(second.container.textContent).toMatch(/import finished/i);
    expect(second.container.textContent).toMatch(/more imports/i);
    expect(second.container.textContent).toMatch(/cancel/i);
  });
});
