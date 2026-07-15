import { describe, expect, it } from "vitest";
import { buildSearchParams, parseProductQuery } from "@/lib/search-params";

describe("parseProductQuery", () => {
  it("returns an empty query for no params", () => {
    expect(parseProductQuery({})).toEqual({});
  });

  it("reads a trimmed search term", () => {
    expect(parseProductQuery({ q: "  wizard  " })).toEqual({ search: "wizard" });
  });

  it("ignores a whitespace-only search term", () => {
    expect(parseProductQuery({ q: "   " })).toEqual({});
  });

  it("accepts a comma-separated list", () => {
    expect(parseProductQuery({ stock: "disponibile,esaurito" })).toEqual({
      stock: ["disponibile", "esaurito"],
    });
  });

  it("accepts a repeated key, which Next hands over as an array", () => {
    expect(parseProductQuery({ stock: ["disponibile", "in-arrivo"] })).toEqual({
      stock: ["disponibile", "in-arrivo"],
    });
  });

  it("drops unknown list values but keeps the valid ones", () => {
    expect(parseProductQuery({ stock: "disponibile,inventato" })).toEqual({ stock: ["disponibile"] });
  });

  it("omits the key entirely when every list value is invalid", () => {
    expect(parseProductQuery({ stock: "inventato" })).toEqual({});
  });

  it("converts euro params to cents", () => {
    expect(parseProductQuery({ min: "10", max: "24.99" })).toEqual({ minPrice: 1000, maxPrice: 2499 });
  });

  it("ignores a non-numeric or negative price", () => {
    expect(parseProductQuery({ max: "abc" })).toEqual({});
    expect(parseProductQuery({ min: "-5" })).toEqual({});
  });

  it("ignores an invalid sort rather than throwing", () => {
    expect(parseProductQuery({ sort: "casuale" })).toEqual({});
  });

  it("ignores a non-positive or fractional page", () => {
    expect(parseProductQuery({ page: "0" })).toEqual({});
    expect(parseProductQuery({ page: "1.5" })).toEqual({});
    expect(parseProductQuery({ page: "abc" })).toEqual({});
  });

  it("never sets a key to undefined, which exactOptionalPropertyTypes forbids", () => {
    const query = parseProductQuery({ q: "x" });
    expect(Object.keys(query)).toEqual(["search"]);
  });

  it("degrades a hand-mangled query string to the default listing", () => {
    expect(parseProductQuery({ categoria: "non-esiste", sort: "??", page: "-3" })).toEqual({});
  });
});

describe("buildSearchParams", () => {
  it("returns an empty string when there is nothing to encode", () => {
    expect(buildSearchParams({})).toBe("");
  });

  it("omits the default sort and the first page, keeping URLs clean", () => {
    expect(buildSearchParams({ sort: "popolari", page: 1 })).toBe("");
  });

  it("encodes filters", () => {
    expect(buildSearchParams({ stock: ["disponibile"], sort: "novita" })).toBe("?sort=novita&stock=disponibile");
  });

  it("writes prices back as euros", () => {
    expect(buildSearchParams({ maxPrice: 2499 })).toBe("?max=24.99");
  });

  it("round-trips through parseProductQuery", () => {
    const query = { stock: ["disponibile"], bladeType: ["attacco"], maxPrice: 3000, sort: "nome" } as const;
    const encoded = buildSearchParams(query);
    const params = Object.fromEntries(new URLSearchParams(encoded.slice(1)));
    expect(parseProductQuery(params)).toEqual(query);
  });
});
