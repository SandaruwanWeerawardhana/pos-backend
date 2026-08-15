import {
  BitArray,
  Code39Reader,
  Code128Reader,
  EAN13Reader,
  MultiFormatOneDReader,
  type DecodeHintType,
  type Result,
} from "@zxing/library";
import { barRuns, encodeBarcode } from "@/lib/products/barcode-encode";

const QUIET_ZONE = 24;
const SCALE = 3;

/*
 * Turns a module string into a scanned row: each module widened so the
 * readers' width tolerances behave like they do on a real scan, with a quiet
 * zone either side.
 */
function toRow(modules: string): BitArray {
  const scaled = [...modules].flatMap((module) => Array(SCALE).fill(module));
  const width = QUIET_ZONE * 2 + scaled.length;
  const row = new BitArray(width);
  scaled.forEach((module, index) => {
    if (module === "1") row.set(QUIET_ZONE + index);
  });
  return row;
}

interface RowReader {
  decodeRow(
    rowNumber: number,
    row: BitArray,
    hints: Map<DecodeHintType, unknown>,
  ): Result;
}

function decode(reader: RowReader, modules: string): string {
  return reader.decodeRow(0, toRow(modules), new Map()).getText();
}

function encoded(value: string, symbology: Parameters<typeof encodeBarcode>[1]): string {
  const modules = encodeBarcode(value, symbology);
  if (!modules) throw new Error(`${symbology} refused ${value}`);
  return modules;
}

describe("barcode encoding", () => {
  it("encodes Code 128 in subset C that scans back to the same digits", () => {
    expect(decode(new Code128Reader(), encoded("71934224", "CODE128"))).toBe(
      "71934224",
    );
  });

  it("encodes Code 128 in subset B for mixed alphanumerics", () => {
    expect(decode(new Code128Reader(), encoded("DAI-MILK-1042", "CODE128"))).toBe(
      "DAI-MILK-1042",
    );
  });

  it("encodes Code 39", () => {
    expect(decode(new Code39Reader(), encoded("ABC-123", "CODE39"))).toBe(
      "ABC-123",
    );
  });

  it("encodes EAN-13", () => {
    expect(decode(new EAN13Reader(), encoded("5901234123457", "EAN13"))).toBe(
      "5901234123457",
    );
  });

  it("encodes EAN-8", () => {
    const reader = new MultiFormatOneDReader(new Map());
    expect(decode(reader, encoded("96385074", "EAN8"))).toBe("96385074");
  });

  it("encodes UPC-A as its EAN-13 equivalent", () => {
    expect(decode(new EAN13Reader(), encoded("036000291452", "UPCA"))).toBe(
      "0036000291452",
    );
  });

  it("encodes UPC-E with the guards its symbology requires", () => {
    const modules = encoded("01234565", "UPCE");
    expect(modules.startsWith("101")).toBe(true);
    expect(modules.endsWith("010101")).toBe(true);
    expect(modules).toHaveLength(51);
  });

  it("refuses values the symbology cannot carry", () => {
    expect(encodeBarcode("123", "EAN13")).toBeNull();
    expect(encodeBarcode("12345678901A", "UPCA")).toBeNull();
    expect(encodeBarcode("", "CODE128")).toBeNull();
  });

  it("reports bar runs that cover every set module", () => {
    const runs = barRuns("110010111");
    expect(runs).toEqual([
      { start: 0, width: 2 },
      { start: 4, width: 1 },
      { start: 6, width: 3 },
    ]);
  });
});
