import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { bladeName, partCode, partMark } from "@/lib/holo";

const spec = (value: string) => ({ specs: [{ label: "Codice", value }] });

describe("partCode", () => {
  it("reads the part code from the specs", () => {
    expect(partCode(spec("9-60GF"))).toBe("9-60GF");
    expect(partCode(spec(" IS 7-55T "))).toBe("IS 7-55T");
  });

  it("gives nothing to items without a code and to bundles", () => {
    expect(partCode({ specs: [{ label: "Tipo", value: "Porta deck" }] })).toBeNull();
    expect(partCode({ ...spec("9-65GB"), bundleOf: [{ slug: "shatter-horus-9-65gb", quantity: 1 }] })).toBeNull();
    expect(partCode(spec("9-65GB · IS 7-55T"))).toBeNull();
  });
});

describe("bladeName", () => {
  it("drops the code words the name ends with", () => {
    expect(bladeName("Soar Phoenix 9-60GF", "9-60GF")).toBe("Soar Phoenix");
    expect(bladeName("Tread Croc TQ 5-50GN", "TQ 5-50GN")).toBe("Tread Croc");
    expect(bladeName("Glory Valkerion LF", "LF")).toBe("Glory Valkerion");
    expect(bladeName("CX-00 Tigarage FT3-60T", "CX-00 FT3-60T")).toBe("CX-00 Tigarage");
  });

  it("keeps a name that does not end in its code, and never empties it", () => {
    expect(bladeName("Blast Pegasus A Tr", null)).toBe("Blast Pegasus A Tr");
    expect(bladeName("CX-00 Evangelion Deck Set", "CX-00")).toBe("CX-00 Evangelion Deck Set");
    expect(bladeName("LF", "LF")).toBe("LF");
  });
});

describe("partMark", () => {
  it("prints the ratchet, or a short bit code", () => {
    expect(partMark("9-60GF")).toBe("9-60");
    expect(partMark("IS 7-55T")).toBe("7-55");
    expect(partMark("LF")).toBe("LF");
  });

  it("prints nothing for a long code without a ratchet", () => {
    expect(partMark("UX-00 LF")).toBeNull();
    expect(partMark("CX-00")).toBeNull();
    expect(partMark(null)).toBeNull();
  });
});

describe("the catalogue", () => {
  it("never loses a product's name to its code", () => {
    for (const product of [...PRODUCTS, ...BUNDLES]) {
      const name = bladeName(product.name, partCode(product));
      expect(name.length, product.slug).toBeGreaterThan(0);
      expect(product.name.startsWith(name), product.slug).toBe(true);
    }
  });
});
