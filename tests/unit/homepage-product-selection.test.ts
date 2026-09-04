import { describe, expect, it } from "vitest";
import { allocateUniqueProductSections } from "@/lib/home/product-selection";

const products = (...slugs: string[]) => slugs.map((slug) => ({ slug }));
const slugs = (section: readonly { readonly slug: string }[] | undefined) => section?.map((product) => product.slug);

describe("homepage product allocation", () => {
  it("keeps the first appearance and preserves unique products in later sections", () => {
    const allocated = allocateUniqueProductSections([
      products("cobalt", "soar", "saber"),
      products("soar", "blast", "cobalt"),
      undefined,
      products("saber", "drop", "blast"),
    ]);

    expect(allocated.map(slugs)).toEqual([
      ["cobalt", "soar", "saber"],
      ["blast"],
      undefined,
      ["drop"],
    ]);
  });

  it("removes duplicate targets inside one section and leaves a consumed section empty", () => {
    const allocated = allocateUniqueProductSections([
      products("cobalt", "cobalt", "soar"),
      products("soar", "cobalt"),
    ]);

    expect(allocated.map(slugs)).toEqual([["cobalt", "soar"], []]);
  });
});
