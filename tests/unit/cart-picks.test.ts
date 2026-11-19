import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { cartPickShelf, colourAliases } from "@/lib/commerce/cart-pick-shelf";
import { NO_SALES_FACTS, picksForCart, salesFacts, type CartPick, type CartPickShelf, type SalesFacts } from "@/lib/commerce/cart-picks";
import type { Product } from "@/lib/commerce/types";

const order = (...slugs: string[]) => slugs.map((slug) => ({ slug, quantity: 1 }));

function pick(slug: string, extra: Partial<CartPick> = {}): CartPick {
  return {
    slug: slug as CartPick["slug"],
    name: slug,
    title: slug,
    code: null,
    price: { amount: 1990, currency: "EUR" },
    image: null,
    members: [slug],
    relatedTo: [],
    ...extra,
  };
}

function shelf(picks: readonly CartPick[], facts: SalesFacts = NO_SALES_FACTS, alias: Record<string, string> = {}): CartPickShelf {
  return { picks, facts, alias };
}

describe("salesFacts", () => {
  it("counts a pair only when two paid orders held it", () => {
    const facts = salesFacts([order("a", "b"), order("a", "b"), order("a", "c")]);
    expect(facts.together["a"]).toEqual(["b"]);
    expect(facts.together["b"]).toEqual(["a"]);
    expect(facts.together["c"]).toBeUndefined();
  });

  it("lists the pieces bought with one, the most frequent first", () => {
    const facts = salesFacts([order("a", "b"), order("a", "b"), order("a", "c"), order("a", "c"), order("a", "c")]);
    expect(facts.together["a"]).toEqual(["c", "b"]);
  });

  it("ranks best sellers by units, not by orders", () => {
    const facts = salesFacts([[{ slug: "a", quantity: 1 }], [{ slug: "a", quantity: 1 }], [{ slug: "b", quantity: 5 }]]);
    expect(facts.bestSellers).toEqual(["b", "a"]);
  });

  it("folds the colours of one item into a single piece", () => {
    const canonical = (slug: string) => (slug.startsWith("case-") ? "case" : slug);
    const facts = salesFacts([order("a", "case-red"), order("a", "case-blue"), order("case-red", "case-blue")], canonical);
    expect(facts.together["a"]).toEqual(["case"]);
    expect(facts.together["case"]).toEqual(["a"]);
    expect(facts.bestSellers[0]).toBe("case");
  });
});

describe("picksForCart", () => {
  const picks = [pick("a"), pick("b"), pick("c"), pick("d"), pick("e")];

  it("suggests nothing for an empty cart", () => {
    expect(picksForCart([], shelf(picks, { together: {}, bestSellers: ["a", "b"] }))).toBeNull();
  });

  it("says 'bought together' when paid orders back at least two pieces, and names the cart line", () => {
    const facts = { together: { a: ["c", "b"] }, bestSellers: ["e", "d", "c", "b", "a"] };
    const result = picksForCart(["a"], shelf(picks, facts));
    expect(result?.reason).toBe("together");
    expect(result?.items.map((item) => [item.pick.slug, item.with])).toEqual([
      ["c", "a"],
      ["b", "a"],
    ]);
  });

  it("leads with a piece that went with two cart lines", () => {
    const facts = { together: { a: ["c", "d"], b: ["d"] }, bestSellers: [] };
    const result = picksForCart(["a", "b"], shelf(picks, facts));
    expect(result?.items.map((item) => item.pick.slug)).toEqual(["d", "c"]);
  });

  it("never suggests what is already in the cart", () => {
    const facts = { together: { a: ["b", "c", "d"] }, bestSellers: ["a", "b", "c", "d", "e"] };
    const result = picksForCart(["a", "b"], shelf(picks, facts));
    expect(result?.items.map((item) => item.pick.slug)).toEqual(["c", "d"]);
  });

  it("falls back to best sellers, without the claim, when one pair is all there is", () => {
    const facts = { together: { a: ["b"] }, bestSellers: ["d", "a", "b", "c"] };
    const result = picksForCart(["a"], shelf(picks, facts));
    expect(result?.reason).toBe("bestsellers");
    expect(result?.items.map((item) => [item.pick.slug, item.with])).toEqual([
      ["d", null],
      ["b", null],
      ["c", null],
    ]);
  });

  it("falls back to the catalogue's related pieces when there are no sales facts", () => {
    const related = [pick("a"), pick("b", { relatedTo: ["a"] }), pick("c")];
    const result = picksForCart(["a"], shelf(related));
    expect(result?.reason).toBe("related");
    expect(result?.items.map((item) => item.pick.slug)).toEqual(["b"]);
  });

  it("shows nothing rather than a guess", () => {
    expect(picksForCart(["a"], shelf(picks))).toBeNull();
  });

  it("caps the shelf", () => {
    const facts = { together: {}, bestSellers: ["a", "b", "c", "d", "e"] };
    expect(picksForCart(["x"], shelf(picks, facts), 3)?.items).toHaveLength(3);
  });

  it("treats a colour in the cart as its item: counted under the item, and the item is not suggested again", () => {
    const withCase = [...picks, pick("case", { members: ["case", "case-blue"], colours: 2 })];
    const facts = { together: { case: ["b", "c"] }, bestSellers: ["case", "b", "c"] };
    const result = picksForCart(["case-blue"], shelf(withCase, facts, { "case-blue": "case" }));
    expect(result?.reason).toBe("together");
    expect(result?.items.map((item) => [item.pick.slug, item.with])).toEqual([
      ["b", "case-blue"],
      ["c", "case-blue"],
    ]);
  });
});

describe("cartPickShelf", () => {
  const bySlug = new Map(PRODUCTS.map((product) => [product.slug as string, product]));
  const full = cartPickShelf(PRODUCTS, NO_SALES_FACTS);

  it("offers only pieces on the shelf, from the shop's own warehouse, that fit the same parcel", () => {
    expect(full.picks.length).toBeGreaterThan(0);
    for (const offered of full.picks) {
      const members = offered.members.map((slug) => bySlug.get(slug)).filter((member): member is Product => member !== undefined);
      expect(members.some((member) => member.stock === "disponibile")).toBe(true);
      for (const member of members) {
        expect(member.bundleOf).toBeUndefined();
        expect(member.consignment).toBeUndefined();
        expect(member.category).not.toBe("stadi");
      }
    }
  });

  it("leaves out a piece that is sold out or still on its way", () => {
    const soldOut = PRODUCTS.map((product, index): Product => (index === 0 ? { ...product, stock: "esaurito", availableQuantity: 0 } : product));
    const first = PRODUCTS[0]?.slug;
    expect(cartPickShelf(soldOut, NO_SALES_FACTS).picks.some((offered) => offered.members.includes(first as string))).toBe(false);
    const arriving = PRODUCTS.map((product, index): Product => (index === 0 ? { ...product, stock: "pre-ordine" } : product));
    expect(cartPickShelf(arriving, NO_SALES_FACTS).picks.some((offered) => offered.members.includes(first as string))).toBe(false);
  });

  it("shows an item sold in colours once, and sends the buyer to choose", () => {
    const families = full.picks.filter((offered) => offered.colours !== undefined);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(family.members.length).toBe(family.colours);
      expect(full.picks.filter((offered) => offered.members.some((slug) => family.members.includes(slug)))).toHaveLength(1);
    }
    const alias = colourAliases(PRODUCTS);
    for (const [colour, lead] of Object.entries(alias)) expect(colour).not.toBe(lead);
  });

  it("sends the browser the order of the pieces it can show, never a count", () => {
    const facts = salesFacts([order("glory-valkerion-lf", "soar-phoenix-9-60gf", "not-in-the-shop"), order("glory-valkerion-lf", "soar-phoenix-9-60gf", "not-in-the-shop")]);
    const built = cartPickShelf(PRODUCTS, facts);
    const offered = new Set(built.picks.map((entry) => entry.slug as string));
    for (const others of Object.values(built.facts.together)) for (const slug of others) expect(offered.has(slug)).toBe(true);
    expect(built.facts.bestSellers).not.toContain("not-in-the-shop");
    const leaves = [...Object.values(built.facts.together).flat(), ...built.facts.bestSellers];
    expect(leaves.every((leaf) => typeof leaf === "string")).toBe(true);
  });
});
