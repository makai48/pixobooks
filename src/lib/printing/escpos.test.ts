import { describe, expect, it } from "vitest";
import { EscPosWriter, concatBytes, encodeText, escpos } from "@/lib/printing/escpos";

const toArray = (input: Uint8Array): number[] => Array.from(input);

describe("encodeText", () => {
  it("keeps printable ASCII unchanged", () => {
    expect(toArray(encodeText("Pixo 123!"))).toEqual(
      Array.from("Pixo 123!", (char) => char.charCodeAt(0)),
    );
  });

  it("drops control characters, maps tab to a space, and keeps newlines", () => {
    expect(toArray(encodeText("a\u0001b\tc\n"))).toEqual([97, 98, 32, 99, 10]);
    expect(toArray(encodeText("\u007f"))).toEqual([]);
  });

  it("encodes cp437 accents and currency at their table positions", () => {
    expect(toArray(encodeText("é", "cp437"))).toEqual([0x82]);
    expect(toArray(encodeText("£", "cp437"))).toEqual([0x9c]);
    expect(toArray(encodeText("°", "cp437"))).toEqual([0xf8]);
    expect(toArray(encodeText("Ç", "cp437"))).toEqual([0x80]);
  });

  it("encodes cp1252 euro and accented Latin-1", () => {
    expect(toArray(encodeText("€", "cp1252"))).toEqual([0x80]);
    expect(toArray(encodeText("é", "cp1252"))).toEqual([0xe9]);
  });

  it("uses the euro replacement in cp858 and falls back in cp850", () => {
    expect(toArray(encodeText("€", "cp858"))).toEqual([0xd5]);
    expect(toArray(encodeText("€", "cp850"))).toEqual([0x3f]);
  });

  it("falls back to a question mark for unsupported scripts", () => {
    expect(toArray(encodeText("Ж", "cp437"))).toEqual([0x3f]);
    expect(toArray(encodeText("Ж", "cp1252"))).toEqual([0x3f]);
  });
});

describe("escpos commands", () => {
  it("builds initialization, alignment, and style commands", () => {
    expect(toArray(escpos.init())).toEqual([0x1b, 0x40]);
    expect(toArray(escpos.align("left"))).toEqual([0x1b, 0x61, 0]);
    expect(toArray(escpos.align("center"))).toEqual([0x1b, 0x61, 1]);
    expect(toArray(escpos.align("right"))).toEqual([0x1b, 0x61, 2]);
    expect(toArray(escpos.bold(true))).toEqual([0x1b, 0x45, 1]);
    expect(toArray(escpos.bold(false))).toEqual([0x1b, 0x45, 0]);
    expect(toArray(escpos.underline(true))).toEqual([0x1b, 0x2d, 1]);
    expect(toArray(escpos.underline(false))).toEqual([0x1b, 0x2d, 0]);
  });

  it("clamps character size and feed counts", () => {
    expect(toArray(escpos.size())).toEqual([0x1d, 0x21, 0x00]);
    expect(toArray(escpos.size(2, 2))).toEqual([0x1d, 0x21, 0x11]);
    expect(toArray(escpos.size(9, 9))).toEqual([0x1d, 0x21, 0x77]);
    expect(toArray(escpos.feed())).toEqual([0x1b, 0x64, 1]);
    expect(toArray(escpos.feed(3))).toEqual([0x1b, 0x64, 3]);
    expect(toArray(escpos.feed(300))).toEqual([0x1b, 0x64, 255]);
  });

  it("builds cut, drawer, and codepage commands", () => {
    expect(toArray(escpos.cut())).toEqual([0x1d, 0x56, 0x01]);
    expect(toArray(escpos.cut(false))).toEqual([0x1d, 0x56, 0x00]);
    expect(toArray(escpos.drawerKick())).toEqual([0x1b, 0x70, 0, 25, 250]);
    expect(toArray(escpos.drawerKick(1, 50, 100))).toEqual([0x1b, 0x70, 1, 50, 100]);
    expect(toArray(escpos.codepage("cp437"))).toEqual([0x1b, 0x74, 0]);
    expect(toArray(escpos.codepage("cp850"))).toEqual([0x1b, 0x74, 2]);
    expect(toArray(escpos.codepage("cp858"))).toEqual([0x1b, 0x74, 19]);
    expect(toArray(escpos.codepage("cp1252"))).toEqual([0x1b, 0x74, 16]);
  });
});

describe("EscPosWriter", () => {
  it("initializes with the selected codepage", () => {
    expect(toArray(new EscPosWriter("cp437").init().toBytes())).toEqual([
      0x1b, 0x40, 0x1b, 0x74, 0x00,
    ]);
    expect(toArray(new EscPosWriter("cp850").init().toBytes())).toEqual([
      0x1b, 0x40, 0x1b, 0x74, 0x02,
    ]);
  });

  it("encodes text and lines with the writer codepage", () => {
    expect(toArray(new EscPosWriter("cp437").line("é").toBytes())).toEqual([0x82, 0x0a]);
    expect(toArray(new EscPosWriter().line().toBytes())).toEqual([0x0a]);
    expect(new EscPosWriter().text("").toBytes()).toHaveLength(0);
  });

  it("appends raw bytes in order", () => {
    const writer = new EscPosWriter("cp437");
    writer.raw(Uint8Array.of(9)).line("A");
    expect(toArray(writer.toBytes())).toEqual([9, 65, 0x0a]);
  });
});

describe("concatBytes", () => {
  it("joins chunks and handles empty input", () => {
    expect(toArray(concatBytes([Uint8Array.of(1, 2), Uint8Array.of(3)]))).toEqual([1, 2, 3]);
    expect(concatBytes([])).toHaveLength(0);
  });
});
