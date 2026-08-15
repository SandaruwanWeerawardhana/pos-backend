import {
  generateBarcode,
  isGtinLength,
  isValidEan13,
  isValidGtin,
} from "@/lib/products/generate";
import {
  DEFAULT_PRODUCT_FORM_VALUES,
  productFormSchema,
  type ProductFormValues,
} from "@/lib/products/schema";

function values(overrides: Partial<ProductFormValues>): ProductFormValues {
  return {
    ...DEFAULT_PRODUCT_FORM_VALUES,
    name: "Whole milk 2 L",
    sku: "DAI-MILK-1042",
    category: "Dairy",
    selling_price: "3.50",
    ...overrides,
  };
}

function barcodeIssues(input: ProductFormValues): string[] {
  const result = productFormSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path[0] === "barcode")
    .map((issue) => issue.message);
}

describe("GTIN validation", () => {
  it("accepts real check digits at every GTIN length", () => {
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A
    expect(isValidGtin("5901234123457")).toBe(true); // EAN-13
    expect(isValidGtin("15901234123454")).toBe(true); // ITF-14
  });

  it("rejects a wrong check digit and non-GTIN lengths", () => {
    expect(isValidGtin("5901234123458")).toBe(false);
    expect(isValidGtin("200000")).toBe(false);
    expect(isGtinLength("200000")).toBe(false);
  });

  it("generates in-store codes that pass EAN-13", () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = generateBarcode();
      expect(code).toMatch(/^200\d{10}$/);
      expect(isValidEan13(code)).toBe(true);
    }
  });
});

describe("barcode source rules", () => {
  it("takes a package GTIN as scanned", () => {
    expect(barcodeIssues(values({ barcode: "5901234123457" }))).toEqual([]);
  });

  it("flags a mistyped package GTIN", () => {
    expect(barcodeIssues(values({ barcode: "5901234123458" }))).toEqual([
      "Check digit does not match — re-scan the package barcode",
    ]);
  });

  it("allows a short in-house package code with no check digit", () => {
    expect(barcodeIssues(values({ barcode: "778899" }))).toEqual([]);
  });

  it("requires a valid EAN-13 when the code is generated in-store", () => {
    expect(
      barcodeIssues(values({ barcode: "778899", barcode_source: "generated" })),
    ).toEqual(["Use Generate to create a valid EAN-13 in-store barcode"]);
    expect(
      barcodeIssues(
        values({ barcode: generateBarcode(), barcode_source: "generated" }),
      ),
    ).toEqual([]);
  });
});
