import { describe, expect, it } from "vitest";
import { PROVINCES, PROVINCE_SIGLE } from "@/data/provinces";
import { checkoutSchema } from "@/lib/checkout-schema";

describe("PROVINCES", () => {
  it("contains exactly 107 entries", () => {
    expect(PROVINCES).toHaveLength(107);
  });

  it("all sigle are unique", () => {
    const sigle = PROVINCES.map((p) => p.sigla);
    const unique = new Set(sigle);
    expect(unique.size).toBe(107);
  });

  it("all sigle are 2 uppercase letters", () => {
    for (const p of PROVINCES) {
      expect(p.sigla).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("includes Sud Sardegna (SU)", () => {
    expect(PROVINCE_SIGLE.has("SU")).toBe(true);
  });

  it("includes Monza e della Brianza (MB)", () => {
    expect(PROVINCE_SIGLE.has("MB")).toBe(true);
  });

  it("includes Barletta-Andria-Trani (BT)", () => {
    expect(PROVINCE_SIGLE.has("BT")).toBe(true);
  });

  it("includes Fermo (FM)", () => {
    expect(PROVINCE_SIGLE.has("FM")).toBe(true);
  });

  it("is sorted by name (case-insensitive)", () => {
    const names = PROVINCES.map((p) => p.name.toLowerCase());
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "it"));
    expect(names).toEqual(sorted);
  });

  it("checkoutSchema accepts every sigla in the list", () => {
    const base = {
      email: "test@example.it",
      firstName: "Mario",
      lastName: "Rossi",
      address: "Via Roma 1",
      city: "Milano",
      postalCode: "20121",
      phone: "+39 333 1234567",
      shippingMethod: "standard",
    };
    for (const p of PROVINCES) {
      const result = checkoutSchema.safeParse({ ...base, province: p.sigla });
      expect(result.success, `province ${p.sigla} should be accepted`).toBe(true);
    }
  });
});
