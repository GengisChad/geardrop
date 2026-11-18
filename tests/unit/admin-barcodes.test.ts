import { describe, expect, it } from "vitest";
import { applyScan, isValidGtin, LABEL_LIMIT, normalizeScan, packComplete, parseLabelRequests, productGtinSchema, type PackLine } from "@/lib/admin/barcodes";

describe("isValidGtin", () => {
  it("accepts real box codes by their check digit", () => {
    expect(isValidGtin("5010996214645")).toBe(true); // EAN-13
    expect(isValidGtin("4006381333931")).toBe(true); // EAN-13
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
    expect(isValidGtin("10036000291459")).toBe(true); // GTIN-14
  });

  it("refuses a wrong check digit, letters and odd lengths", () => {
    expect(isValidGtin("5010996214646")).toBe(false);
    expect(isValidGtin("501099621464A")).toBe(false);
    expect(isValidGtin("1234567")).toBe(false);
    expect(isValidGtin("123456789")).toBe(false);
  });

  it("saves digits only, and an empty box clears the code", () => {
    expect(productGtinSchema.parse({ productId: "4", gtin: " 5010996 214645 " })).toEqual({ productId: 4, gtin: "5010996214645" });
    expect(productGtinSchema.parse({ productId: "4", gtin: "" })).toEqual({ productId: 4, gtin: null });
    expect(productGtinSchema.safeParse({ productId: "4", gtin: "5010996214646" }).success).toBe(false);
  });
});

describe("parcel check", () => {
  const lines: PackLine[] = [
    { key: "1", name: "Wizard Arrow 4-80B", sku: "GD-WA480B", gtin: "5010996214645", expected: 2 },
    { key: "2", name: "Porta-deck nero", sku: "GD-DECK-NERO", gtin: null, expected: 1 },
  ];

  it("counts a piece by its box code or by the SKU on our label, in any case", () => {
    expect(applyScan(lines, {}, "5010996214645")).toEqual({ kind: "match", key: "1", name: "Wizard Arrow 4-80B" });
    expect(applyScan(lines, {}, "gd-deck-nero\n")).toEqual({ kind: "match", key: "2", name: "Porta-deck nero" });
    expect(normalizeScan(" GD-WA 480B ")).toBe("GD-WA480B");
  });

  it("flags a piece that is not in the order, and one more than ordered", () => {
    expect(applyScan(lines, {}, "4006381333931")).toEqual({ kind: "unknown", code: "4006381333931" });
    expect(applyScan(lines, { "1": 2 }, "5010996214645")).toEqual({ kind: "extra", key: "1", name: "Wizard Arrow 4-80B" });
  });

  it("is complete only when every line is full", () => {
    expect(packComplete(lines, { "1": 2 })).toBe(false);
    expect(packComplete(lines, { "1": 2, "2": 1 })).toBe(true);
    expect(packComplete([], {})).toBe(false);
  });
});

describe("parseLabelRequests", () => {
  it("reads product:copies pairs, adds repeats and drops nonsense", () => {
    expect(parseLabelRequests(["12:3", "15:1", "12:2", "x:4", "9:0", "-1:3"])).toEqual([
      { productId: 12, copies: 5 },
      { productId: 15, copies: 1 },
    ]);
    expect(parseLabelRequests("7:2,8:1")).toEqual([
      { productId: 7, copies: 2 },
      { productId: 8, copies: 1 },
    ]);
  });

  it("stops at the label limit", () => {
    const requests = parseLabelRequests(["1:90", "2:90"]);
    expect(requests.reduce((sum, request) => sum + request.copies, 0)).toBe(LABEL_LIMIT);
    expect(requests).toEqual([
      { productId: 1, copies: 90 },
      { productId: 2, copies: LABEL_LIMIT - 90 },
    ]);
  });
});
