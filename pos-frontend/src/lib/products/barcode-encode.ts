/*
 * Barcode symbol encoders.
 *
 * The result is a module string: "1" is a bar, "0" is a space, every character
 * one module wide. Rendering (SVG, canvas, label printer) scales it; nothing
 * here knows about pixels.
 *
 * Encoding lives in the app rather than a dependency because @zxing/library
 * ships 1D *readers* only — its writers cover QR, Aztec and Data Matrix.
 */

import type { BarcodeSymbology } from "@/lib/types";

/*
 * Code 128 element widths, one entry per code value 0-106. Each digit is the
 * width in modules of an element, alternating bar, space, bar, … starting with
 * a bar. Value 106 is the stop pattern and carries a seventh element.
 */
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

const CODE128_START_B = 104;
const CODE128_START_C = 105;
const CODE128_STOP = 106;

/*
 * Code 39 element widths, narrow (1) or wide (3), nine elements per character
 * alternating bar, space, … starting with a bar. "*" is the start/stop guard.
 */
const CODE39_PATTERNS: Record<string, string> = {
  "0": "111221211", "1": "211211112", "2": "112211112", "3": "212211111",
  "4": "111221112", "5": "211221111", "6": "112221111", "7": "111211212",
  "8": "211211211", "9": "112211211", A: "211112112", B: "112112112",
  C: "212112111", D: "111122112", E: "211122111", F: "112122111",
  G: "111112212", H: "211112211", I: "112112211", J: "111122211",
  K: "211111122", L: "112111122", M: "212111121", N: "111121122",
  O: "211121121", P: "112121121", Q: "111111222", R: "211111221",
  S: "112111221", T: "111121221", U: "221111112", V: "122111112",
  W: "222111111", X: "121121112", Y: "221121111", Z: "122121111",
  "-": "121111212", ".": "221111211", " ": "122111211", $: "121212111",
  "/": "121211121", "+": "121112121", "%": "111212121", "*": "121121211",
};

/* Left-hand odd parity (L), left-hand even parity (G), right-hand (R). */
const EAN_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const EAN_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];

/* Parity of the first six EAN-13 data digits, keyed by the leading digit. */
const EAN13_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/* Parity of the six UPC-E data digits under number system 0, keyed by check digit. */
const UPCE_PARITY = [
  "GGGLLL", "GGLGLL", "GGLLGL", "GGLLLG", "GLGGLL",
  "GLLGGL", "GLLLGG", "GLGLGL", "GLGLLG", "GLLGLG",
];

const GUARD_NORMAL = "101";
const GUARD_CENTRE = "01010";
const GUARD_UPCE_END = "010101";

function isDigits(value: string): boolean {
  return value.length > 0 && /^\d+$/.test(value);
}

/*
 * Widths alternate bar, space, … starting with a bar, so an element's index
 * decides whether it is written as ones or zeros.
 */
function widthsToModules(widths: string): string {
  let modules = "";
  for (let index = 0; index < widths.length; index += 1) {
    const symbol = index % 2 === 0 ? "1" : "0";
    modules += symbol.repeat(Number(widths[index]));
  }
  return modules;
}

/*
 * Subset C halves the symbol width by packing two digits per code value, so an
 * all-digit code of even length uses it; everything else falls back to subset
 * B, which covers ASCII 32-126.
 */
function encodeCode128(value: string): string | null {
  const useSubsetC = isDigits(value) && value.length % 2 === 0;
  const startCode = useSubsetC ? CODE128_START_C : CODE128_START_B;
  const codes: number[] = [];

  if (useSubsetC) {
    for (let index = 0; index < value.length; index += 2) {
      codes.push(Number(value.slice(index, index + 2)));
    }
  } else {
    for (const character of value) {
      const code = character.charCodeAt(0);
      if (code < 32 || code > 126) return null;
      codes.push(code - 32);
    }
  }

  if (codes.length === 0) return null;

  const checksum =
    codes.reduce(
      (total, code, index) => total + code * (index + 1),
      startCode,
    ) % 103;

  const symbols = [startCode, ...codes, checksum, CODE128_STOP];
  return symbols.map((code) => widthsToModules(CODE128_PATTERNS[code])).join("");
}

function encodeCode39(value: string): string | null {
  const upper = value.toUpperCase();
  const characters = [...`*${upper}*`];
  if (characters.some((character) => !CODE39_PATTERNS[character])) return null;

  /* A narrow space separates characters; there is none after the stop guard. */
  return characters
    .map((character) => widthsToModules(CODE39_PATTERNS[character]))
    .join("0");
}

function encodeDigits(digits: string, parity: string): string {
  let modules = "";
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (parity[index] === "L") modules += EAN_L[digit];
    else if (parity[index] === "G") modules += EAN_G[digit];
    else modules += EAN_R[digit];
  }
  return modules;
}

function encodeEan13(value: string): string | null {
  if (!isDigits(value) || value.length !== 13) return null;
  const parity = EAN13_PARITY[Number(value[0])];
  return (
    GUARD_NORMAL +
    encodeDigits(value.slice(1, 7), parity) +
    GUARD_CENTRE +
    encodeDigits(value.slice(7), "RRRRRR") +
    GUARD_NORMAL
  );
}

function encodeEan8(value: string): string | null {
  if (!isDigits(value) || value.length !== 8) return null;
  return (
    GUARD_NORMAL +
    encodeDigits(value.slice(0, 4), "LLLL") +
    GUARD_CENTRE +
    encodeDigits(value.slice(4), "RRRR") +
    GUARD_NORMAL
  );
}

/* UPC-A is an EAN-13 whose leading digit is zero; only the printed grouping differs. */
function encodeUpcA(value: string): string | null {
  if (!isDigits(value) || value.length !== 12) return null;
  return encodeEan13(`0${value}`);
}

/*
 * UPC-E carries no centre guard: number system, six data digits whose parity
 * spells out the check digit, then a six-module end guard. Number system 1
 * inverts every parity.
 */
function encodeUpcE(value: string): string | null {
  if (!isDigits(value) || value.length !== 8) return null;
  const numberSystem = Number(value[0]);
  if (numberSystem > 1) return null;

  const base = UPCE_PARITY[Number(value[7])];
  const parity =
    numberSystem === 0
      ? base
      : [...base].map((code) => (code === "L" ? "G" : "L")).join("");

  return (
    GUARD_NORMAL + encodeDigits(value.slice(1, 7), parity) + GUARD_UPCE_END
  );
}

/**
 * Encodes `value` in `symbology` and returns its module string, or null when
 * the value cannot be represented — a mistyped GTIN, or characters outside the
 * symbology's alphabet. Callers show the digits alone rather than a symbol no
 * scanner would read back as the same code.
 */
export function encodeBarcode(
  value: string,
  symbology: BarcodeSymbology = "CODE128",
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (symbology) {
    case "CODE128":
      return encodeCode128(trimmed);
    case "CODE39":
      return encodeCode39(trimmed);
    case "EAN13":
      return encodeEan13(trimmed);
    case "EAN8":
      return encodeEan8(trimmed);
    case "UPCA":
      return encodeUpcA(trimmed);
    case "UPCE":
      return encodeUpcE(trimmed);
    default:
      return null;
  }
}

/** Consecutive bar runs as `{ start, width }` in modules, ready to draw. */
export function barRuns(modules: string): { start: number; width: number }[] {
  const runs: { start: number; width: number }[] = [];
  let index = 0;

  while (index < modules.length) {
    if (modules[index] === "0") {
      index += 1;
      continue;
    }
    const start = index;
    while (index < modules.length && modules[index] === "1") index += 1;
    runs.push({ start, width: index - start });
  }

  return runs;
}
