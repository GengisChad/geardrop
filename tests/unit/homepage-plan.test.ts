import { describe, expect, it } from "vitest";
import { homepagePlan } from "@/lib/home/product-selection";

type Item = { slug: string; tags: string[]; stock: string; bundleOf?: unknown; variant?: unknown };
const item = (slug: string, stock: string, extra: Partial<Item> = {}): Item => ({ slug, tags: [], stock, ...extra });
const slugs = (items: readonly { readonly slug: string }[]) => items.map((product) => product.slug);

// The live shop on 2026-09-21: the drop leads, one drop piece has sold out.
const catalogue = [
  item("duo", "disponibile", { bundleOf: [] }),
  item("drake", "pre-ordine", { tags: ["novita"] }),
  item("clock", "pre-ordine", { tags: ["novita"] }),
  item("superion", "esaurito", { tags: ["novita"] }),
  item("dran", "pre-ordine", { tags: ["novita"] }),
  item("croc", "pre-ordine", { tags: ["novita"] }),
  item("glory", "pre-ordine"),
  item("enlil", "disponibile"),
  item("horus", "disponibile"),
  item("dragoon", "pre-ordine"),
  item("deck", "disponibile", { variant: {} }),
];

describe("homepage plan", () => {
  it("leads with the new releases still on sale, then what ships now, then the rest with sold-out last", () => {
    const plan = homepagePlan(catalogue, 4);
    expect(slugs(plan.hero)).toEqual(["drake", "clock", "dran", "croc"]);
    expect(plan.heroIsNewRelease).toBe(true);
    // Single pieces first, then the duo, then the deck case.
    expect(slugs(plan.ready)).toEqual(["enlil", "horus", "duo", "deck"]);
    expect(slugs(plan.rest)).toEqual(["glory", "dragoon", "superion"]);
  });

  it("shows every product exactly once", () => {
    const plan = homepagePlan(catalogue, 4);
    const shown = [...plan.hero, ...plan.ready, ...plan.rest].map((product) => product.slug);
    expect(shown.sort()).toEqual(slugs(catalogue).sort());
  });

  it("sends a release beyond the hero's cards to the rest, and deals what is on sale when nothing is new", () => {
    expect(slugs(homepagePlan(catalogue, 2).rest).slice(0, 2)).toEqual(["dran", "croc"]);
    const plain = homepagePlan([item("a", "esaurito"), item("b", "pre-ordine"), item("c", "disponibile")], 4);
    expect(slugs(plain.hero)).toEqual(["b", "c"]);
    expect(plain.heroIsNewRelease).toBe(false);
  });
});
