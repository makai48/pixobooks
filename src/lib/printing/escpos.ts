export type EscPosCodepage = "cp437" | "cp850" | "cp858" | "cp1252";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";

const CP850_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´\u00ad±‗¾¶§÷¸°¨·¹³²■\u00a0";

const CP1252_LATIN1 = Array.from({ length: 96 }, (_, index) => String.fromCharCode(0xa0 + index)).join("");

const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ" + CP1252_LATIN1;

const CODEPAGE_NUMBER: Record<EscPosCodepage, number> = {
  cp437: 0,
  cp850: 2,
  cp858: 19,
  cp1252: 16,
};

const HIGH_TABLES = new Map<EscPosCodepage, Map<string, number>>();

function buildTable(chars: string): Map<string, number> {
  const points = Array.from(chars);
  const table = new Map<string, number>();
  if (points.length !== 128) return table;
  points.forEach((char, index) => {
    if (!table.has(char)) table.set(char, 0x80 + index);
  });
  return table;
}

function highTable(page: EscPosCodepage): Map<string, number> {
  const cached = HIGH_TABLES.get(page);
  if (cached) return cached;
  const table =
    page === "cp437"
      ? buildTable(CP437_HIGH)
      : page === "cp858"
        ? buildTable(CP850_HIGH.replace("ı", "€"))
        : page === "cp850"
          ? buildTable(CP850_HIGH)
          : buildTable(CP1252_HIGH);
  HIGH_TABLES.set(page, table);
  return table;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function encodeText(value: string, page: EscPosCodepage = "cp1252"): Uint8Array {
  const table = highTable(page);
  const bytes: number[] = [];
  for (const char of value.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 0;
    if (code === LF) {
      bytes.push(LF);
      continue;
    }
    if (code === 0x09) {
      bytes.push(0x20);
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    bytes.push(table.get(char) ?? 0x3f);
  }
  return Uint8Array.from(bytes);
}

export const escpos = {
  init: (): Uint8Array => Uint8Array.of(ESC, 0x40),
  align: (value: "left" | "center" | "right"): Uint8Array =>
    Uint8Array.of(ESC, 0x61, value === "center" ? 1 : value === "right" ? 2 : 0),
  bold: (on: boolean): Uint8Array => Uint8Array.of(ESC, 0x45, on ? 1 : 0),
  underline: (on: boolean): Uint8Array => Uint8Array.of(ESC, 0x2d, on ? 1 : 0),
  size: (width = 1, height = 1): Uint8Array =>
    Uint8Array.of(GS, 0x21, ((clamp(width, 1, 8) - 1) << 4) | (clamp(height, 1, 8) - 1)),
  feed: (lines = 1): Uint8Array => Uint8Array.of(ESC, 0x64, clamp(lines, 0, 255)),
  cut: (partial = true): Uint8Array => Uint8Array.of(GS, 0x56, partial ? 0x01 : 0x00),
  drawerKick: (pin: 0 | 1 = 0, onMs = 25, offMs = 250): Uint8Array =>
    Uint8Array.of(ESC, 0x70, pin, clamp(onMs, 0, 255), clamp(offMs, 0, 255)),
  codepage: (page: EscPosCodepage): Uint8Array => Uint8Array.of(ESC, 0x74, CODEPAGE_NUMBER[page]),
};

export class EscPosWriter {
  private readonly parts: Uint8Array[] = [];
  private readonly page: EscPosCodepage;

  constructor(page: EscPosCodepage = "cp1252") {
    this.page = page;
  }

  raw(bytes: Uint8Array): this {
    this.parts.push(bytes);
    return this;
  }

  init(): this {
    return this.raw(escpos.init()).raw(escpos.codepage(this.page));
  }

  align(value: "left" | "center" | "right"): this {
    return this.raw(escpos.align(value));
  }

  bold(on: boolean): this {
    return this.raw(escpos.bold(on));
  }

  size(width = 1, height = 1): this {
    return this.raw(escpos.size(width, height));
  }

  text(value: string): this {
    if (!value) return this;
    return this.raw(encodeText(value, this.page));
  }

  line(value = ""): this {
    return this.text(value).raw(Uint8Array.of(LF));
  }

  feed(lines = 1): this {
    return this.raw(escpos.feed(lines));
  }

  cut(partial = true): this {
    return this.raw(escpos.cut(partial));
  }

  drawer(pin: 0 | 1 = 0): this {
    return this.raw(escpos.drawerKick(pin));
  }

  toBytes(): Uint8Array {
    return concatBytes(this.parts);
  }
}
