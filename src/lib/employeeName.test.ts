import { describe, expect, it } from "vitest";
import { deriveDisplayName, employeeInitials } from "./employeeName";

describe("employeeName", () => {
  it("suggests first name + surname initial", () => {
    expect(deriveDisplayName("Sheillah Nakato")).toBe("Sheillah N");
    expect(deriveDisplayName("  John   Doe  ")).toBe("John D");
  });

  it("uses a short form for a single name", () => {
    expect(deriveDisplayName("Amina")).toBe("Ami");
    expect(deriveDisplayName("Jo")).toBe("JO");
  });

  it("builds avatar initials", () => {
    expect(employeeInitials("Sheillah Nakato")).toBe("SN");
    expect(employeeInitials("Amina")).toBe("AM");
  });
});
