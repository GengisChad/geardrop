import { describe, expect, it } from "vitest";
import LegalePage, { generateMetadata } from "@/app/(storefront)/legale/[slug]/page";
import { LEGAL_PAGES, type LegalSlug } from "@/data/pages";
import { createMockContentProvider } from "@/lib/content/mock-provider";

const SLUGS: readonly LegalSlug[] = ["termini", "privacy"];

function pageText(slug: LegalSlug): string {
  const page = LEGAL_PAGES[slug];
  return [page.title, page.lead, ...page.sections.flatMap((section) => [section.heading, ...section.body])].join("\n");
}

describe("legal pages", () => {
  it("publishes terms and privacy through the default content provider", async () => {
    const provider = createMockContentProvider();

    expect(await provider.getPage("termini")).toMatchObject({ title: "Termini e condizioni" });
    expect(await provider.getPage("privacy")).toMatchObject({ title: "Privacy e cookie" });
  });

  it("carries no placeholder wording", () => {
    for (const slug of SLUGS) {
      expect("notice" in LEGAL_PAGES[slug], slug).toBe(false);
      expect(pageText(slug), slug).not.toMatch(/segnaposto|DA COMPLETARE|DA VERIFICARE|Questa sezione/i);
    }
  });

  it("identifies the seller only by VAT number, registered office and contact email", () => {
    for (const slug of SLUGS) {
      const text = pageText(slug);
      expect(text, slug).toContain("18464231002");
      expect(text, slug).toContain("Via Fratelli Cervi 2, 00065 Fiano Romano (RM)");
      expect(text, slug).toContain("gengischad@gmail.com");
      // By the owner's choice no personal registry data is published.
      expect(text, slug).not.toMatch(/codice fiscale|\bPEC\b|\bREA\b|titolare di impresa/i);
    }
  });

  it("renders a published legal route with its metadata", async () => {
    const params = Promise.resolve({ slug: "termini" });

    await expect(generateMetadata({ params })).resolves.toEqual({
      title: "Termini e condizioni",
      description: LEGAL_PAGES.termini.lead,
    });
    await expect(LegalePage({ params })).resolves.toBeTruthy();
  });

  it("still returns not found for an unknown legal slug", async () => {
    const params = Promise.resolve({ slug: "cookie" });

    await expect(generateMetadata({ params })).resolves.toEqual({ title: "Pagina non trovata" });
    await expect(LegalePage({ params })).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
