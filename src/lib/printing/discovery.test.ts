import { describe, expect, it } from "vitest";
import {
  bridgeScanUrl,
  composeIpTarget,
  mergeDiscovered,
  parseIpTarget,
  parseScanResponse,
  type DiscoveredPrinter,
} from "@/lib/printing";

describe("parseIpTarget", () => {
  it("defaults a bare host to the raw print port", () => {
    expect(parseIpTarget("192.168.1.50")).toEqual({ host: "192.168.1.50", port: 9100 });
  });

  it("reads host:port and strips schemes and paths", () => {
    expect(parseIpTarget("192.168.1.50:515")).toEqual({ host: "192.168.1.50", port: 515 });
    expect(parseIpTarget("http://printer.local:9100/status")).toEqual({
      host: "printer.local",
      port: 9100,
    });
  });

  it("accepts bracketed IPv6 targets", () => {
    expect(parseIpTarget("[fe80::1]:9100")).toEqual({ host: "fe80::1", port: 9100 });
  });

  it("rejects empty, malformed, and out-of-range input", () => {
    expect(parseIpTarget("")).toBeNull();
    expect(parseIpTarget("   ")).toBeNull();
    expect(parseIpTarget("host:0")).toBeNull();
    expect(parseIpTarget("host:70000")).toBeNull();
    expect(parseIpTarget("host:abc")).toBeNull();
    expect(parseIpTarget("bad host")).toBeNull();
    expect(parseIpTarget("http://")).toBeNull();
  });
});

describe("composeIpTarget", () => {
  it("joins host and port", () => {
    expect(composeIpTarget("192.168.1.50", 9100)).toBe("192.168.1.50:9100");
  });

  it("brackets IPv6 hosts", () => {
    expect(composeIpTarget("fe80::1", 9100)).toBe("[fe80::1]:9100");
  });

  it("falls back to the raw port and clears blank hosts", () => {
    expect(composeIpTarget("10.0.0.2", 0)).toBe("10.0.0.2:9100");
    expect(composeIpTarget("   ", 9100)).toBe("");
  });
});

describe("bridgeScanUrl", () => {
  it("appends the devices endpoint and trims trailing slashes", () => {
    expect(bridgeScanUrl("http://192.168.1.2:8080/")).toBe("http://192.168.1.2:8080/devices");
  });

  it("rejects blank or non-http values", () => {
    expect(bridgeScanUrl("")).toBeNull();
    expect(bridgeScanUrl("ftp://bridge")).toBeNull();
    expect(bridgeScanUrl("not a url")).toBeNull();
  });
});

describe("parseScanResponse", () => {
  it("reads a devices array with host and port", () => {
    const devices = parseScanResponse({
      devices: [
        { name: "Epson TM-T20", host: "192.168.1.50", port: 9100 },
        { model: "Xprinter", ip: "192.168.1.51" },
      ],
    });
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      name: "Epson TM-T20",
      host: "192.168.1.50",
      port: 9100,
      bus: "network",
      paired: false,
    });
    expect(devices[1]).toMatchObject({ name: "Xprinter", host: "192.168.1.51", port: 9100 });
  });

  it("accepts a bare array and deduplicates targets", () => {
    const devices = parseScanResponse([
      { name: "A", address: "10.0.0.5:9100" },
      { name: "B", address: "10.0.0.5", port: 9100 },
    ]);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.detail).toContain("10.0.0.5:9100");
  });

  it("ignores malformed entries", () => {
    expect(parseScanResponse(null)).toEqual([]);
    expect(parseScanResponse({ devices: "nope" })).toEqual([]);
    expect(parseScanResponse([{ name: "No host" }, { host: "bad host" }, 42])).toEqual([]);
  });
});

describe("mergeDiscovered", () => {
  it("overrides duplicates and keeps discovery order", () => {
    const base: DiscoveredPrinter[] = [
      { id: "a", name: "A", bus: "network", detail: "x", paired: false },
      { id: "b", name: "B", bus: "network", detail: "x", paired: false },
    ];
    const merged = mergeDiscovered(base, [
      { id: "b", name: "B2", bus: "network", detail: "y", paired: false },
      { id: "c", name: "C", bus: "network", detail: "z", paired: false },
    ]);
    expect(merged.map((device) => device.name)).toEqual(["A", "B2", "C"]);
  });
});
