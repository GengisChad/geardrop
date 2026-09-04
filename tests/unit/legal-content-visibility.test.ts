import { describe, expect, it } from "vitest";
import LegalePage, { generateMetadata } from "@/app/(storefront)/legale/[slug]/page";
import { createMockContentProvider } from "@/lib/content/mock-provider";

describe("unreviewed legal content visibility", () => {
  it("withholds placeholder legal pages from the default content provider", async () => {
    const provider = createMockContentProvider();

    expect(await provider.getPage("faq")).not.toBeNull();
    expect(await provider.getPage("termini")).toBeNull();
    expect(await provider.getPage("privacy")).toBeNull();
  });

  it("returns not-found metadata and route behavior for withheld legal pages", async () => {
    const params = Promise.resolve({ slug: "termini" });

    await expect(generateMetadata({ params })).resolves.toEqual({ title: "Pagina non trovata" });
    await expect(LegalePage({ params })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
