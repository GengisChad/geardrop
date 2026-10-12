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

  describe("with best sellers to lead (owner, 2026-10-05)", () => {
    const best = ["glory", "enlil", "superion"];

    it("deals the best sellers on sale first, in the listed order, and gives the drop its own row", () => {
      const plan = homepagePlan(catalogue, 4, best);
      // Superion is the record's best seller but sold out: it is not dealt.
      expect(slugs(plan.hero)).toEqual(["glory", "enlil"]);
      expect(plan.heroIsBestsellers).toBe(true);
      expect(plan.heroIsNewRelease).toBe(false);
      expect(slugs(plan.drop)).toEqual(["drake", "clock", "dran", "croc"]);
      expect(slugs(plan.ready)).toEqual(["horus", "duo", "deck"]);
      expect(slugs(plan.rest)).toEqual(["dragoon", "superion"]);
    });

    it("still shows every product exactly once", () => {
      const plan = homepagePlan(catalogue, 4, best);
      const shown = [...plan.hero, ...plan.arrivals, ...plan.drop, ...plan.ready, ...plan.rest].map((product) => product.slug);
      expect(shown.sort()).toEqual(slugs(catalogue).sort());
    });

    // Owner, 2026-10-08: 199 Soar Phoenix landed and went into the new releases.
    it("gives a new release already on the shelf its own row, never the pre-order one", () => {
      const landed = [...catalogue, item("phoenix", "disponibile", { tags: ["novita"] })];
      const plan = homepagePlan(landed, 4, best);
      expect(slugs(plan.arrivals)).toEqual(["phoenix"]);
      expect(slugs(plan.drop)).toEqual(["drake", "clock", "dran", "croc"]);
      expect(slugs(plan.ready)).not.toContain("phoenix");
      const shown = [...plan.hero, ...plan.arrivals, ...plan.drop, ...plan.ready, ...plan.rest].map((product) => product.slug);
      expect(shown.sort()).toEqual(slugs(landed).sort());
    });

    it("falls back to the September order when no best seller can be sold", () => {
      const plan = homepagePlan(catalogue, 4, ["superion", "not-in-the-catalogue"]);
      expect(plan.heroIsBestsellers).toBe(false);
      expect(slugs(plan.hero)).toEqual(["drake", "clock", "dran", "croc"]);
      expect(plan.arrivals).toEqual([]);
      expect(plan.drop).toEqual([]);
    });
  });

  it("sends a release beyond the hero's cards to the rest, and deals what is on sale when nothing is new", () => {
    expect(slugs(homepagePlan(catalogue, 2).rest).slice(0, 2)).toEqual(["dran", "croc"]);
    const plain = homepagePlan([item("a", "esaurito"), item("b", "pre-ordine"), item("c", "disponibile")], 4);
    expect(slugs(plain.hero)).toEqual(["b", "c"]);
    expect(plain.heroIsNewRelease).toBe(false);
  });
});
