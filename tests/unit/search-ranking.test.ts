import { describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/commerce/mock-provider";

/**
 * Search matches a product's name, tagline and description alike, which is right for
 * finding things and wrong for ordering them. A bundle that lists Cobalt Dragoon among
 * its contents must not sit above the Cobalt Dragoon itself — the browser gate caught this
 * the day the Deck Completo was added, and a unit test is a cheaper place to keep it.
 */

const provider = createMockProvider();

async function search(term: string): Promise<readonly string[]> {
  const page = await provider.listProducts({ search: term, perPage: 60 });
  return page.items.map((item) => item.name);
}

describe("search ranking", () => {
  it("puts the products named Cobalt above the bundle that merely contains one", async () => {
    const names = await search("cobalt");
    expect(names).toContain("Deck Completo");
    expect(names[0]).toContain("Cobalt");
    expect(names[1]).toContain("Cobalt");
    expect(names.indexOf("Deck Completo")).toBeGreaterThan(1);
  });

  it("ranks the named piece first for the loose tops too", async () => {
    expect((await search("impact drake"))[0]).toBe("Impact Drake 9-60LR");
    expect((await search("hover wyvern"))[0]).toBe("Hover Wyvern 3-85N");
  });

  it("still returns what only the description mentions", async () => {
    expect(await search("low rush")).toContain("Impact Drake 9-60LR");
  });

  it("leaves the order alone when there is no search term", async () => {
    const plain = await provider.listProducts({ perPage: 60 });
    const sameWithEmptySearch = await provider.listProducts({ search: "", perPage: 60 });
    expect(sameWithEmptySearch.items.map((item) => item.slug)).toEqual(plain.items.map((item) => item.slug));
  });
});
