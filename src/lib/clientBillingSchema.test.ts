import { describe, expect, it } from "vitest";
import { hasMissingBillingTables, isMissingBillingTable } from "./clientBillingSchema";

describe("isMissingBillingTable", () => {
  it("recognises PostgREST PGRST205", () => {
    expect(
      isMissingBillingTable({
        code: "PGRST205",
        message: "Could not find the table 'public.client_work_entries' in the schema cache",
      })
    ).toBe(true);
  });

  it("recognises Postgres 42P01", () => {
    expect(
      isMissingBillingTable({
        code: "42P01",
        message: 'relation "public.client_invoices" does not exist',
      })
    ).toBe(true);
  });

  it("recognises message text without a code", () => {
    expect(
      isMissingBillingTable(
        new Error("Could not find the table 'public.client_accounts' in the schema cache")
      )
    ).toBe(true);
    expect(
      isMissingBillingTable(new Error('relation "public.client_services" does not exist'))
    ).toBe(true);
  });

  it("ignores unrelated failures", () => {
    expect(isMissingBillingTable(null)).toBe(false);
    expect(isMissingBillingTable(undefined)).toBe(false);
    expect(isMissingBillingTable("boom")).toBe(false);
    expect(
      isMissingBillingTable({ code: "42501", message: "permission denied for table client_accounts" })
    ).toBe(false);
    expect(
      isMissingBillingTable({
        code: "PGRST205",
        message: "Could not find the table 'public.sales' in the schema cache",
      })
    ).toBe(false);
    expect(isMissingBillingTable(new Error("Network request failed"))).toBe(false);
  });
});

describe("hasMissingBillingTables", () => {
  it("is true when any error is a missing billing table", () => {
    expect(
      hasMissingBillingTables([
        null,
        { code: "PGRST205", message: "Could not find the table 'public.client_accounts' in the schema cache" },
        new Error("nope"),
      ])
    ).toBe(true);
  });

  it("is false for an empty or unrelated list", () => {
    expect(hasMissingBillingTables([])).toBe(false);
    expect(hasMissingBillingTables([null, new Error("nope")])).toBe(false);
  });
});
