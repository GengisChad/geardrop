import { describe, expect, it } from "vitest";
import { metaRankingEntrySchema, metaSnapshotSchema, productSlugSchema } from "@/lib/admin/meta";
import { resolveSnapshot } from "@/lib/meta/repository";
import { monthLabel, type MetaRankingRow, type MetaSnapshotRow } from "@/lib/meta/types";
import { metaPageJsonLd } from "@/lib/seo";

/**
 * The property that carries this feature is the honest row: a piece the shop cannot
 * supply has to say so rather than quietly disappear or link somewhere wrong. Everything
 * else here protects that — a slug typo caught in the panel instead of by a reader
 * hitting a 404.
 */

const snapshot: MetaSnapshotRow = {
  id: 1,
  month: "2026-10",
  title: "Meta di ottobre 2026",
  source_note: "Podi top 3 di 153 tornei WBO.",
  intro: null,
  publication_status: "published",
  published_at: "2026-10-05T00:00:00.000Z",
  active: true,
  seo_title: null,
  seo_description: null,
  created_at: "2026-10-05T00:00:00.000Z",
  updated_at: "2026-10-05T00:00:00.000Z",
};

const row = (over: Partial<MetaRankingRow>): MetaRankingRow => ({
  id: 1,
  snapshot_id: 1,
  tier_type: "bit",
  rank: 1,
  piece_name: "Low Flat (LF)",
  archetype: "Attacco",
  reason: "Perché sì.",
  trend: null,
  product_slug: null,
  video_url: null,
  created_at: "2026-10-05T00:00:00.000Z",
  ...over,
});

describe("product slug validation", () => {
  it("accepts a slug the catalogue actually sells", () => {
    expect(productSlugSchema.parse("glory-valkerion-lf")).toBe("glory-valkerion-lf");
  });

  it("reads an empty field as 'we do not sell this piece'", () => {
    expect(productSlugSchema.parse("")).toBeNull();
    expect(productSlugSchema.parse("   ")).toBeNull();
  });

  it("refuses a slug that is not in the catalogue, so the typo never reaches a reader", () => {
    const result = productSlugSchema.safeParse("glory-valkyrie-lf");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("non esiste a catalogo");
  });

  it("is case-insensitive about what was pasted in", () => {
    expect(productSlugSchema.parse("Glory-Valkerion-LF")).toBe("glory-valkerion-lf");
  });
});

describe("ranking entry", () => {
  const entry = { pieceName: "Low Flat (LF)", archetype: "Attacco", reason: "x", trend: "", productSlug: "", videoUrl: "" };

  it("keeps an https video link and drops an empty one", () => {
    expect(metaRankingEntrySchema.parse(entry).videoUrl).toBeNull();
    expect(metaRankingEntrySchema.parse({ ...entry, videoUrl: "https://youtu.be/abc" }).videoUrl).toBe("https://youtu.be/abc");
  });

  it("refuses a video link that is not https", () => {
    expect(metaRankingEntrySchema.safeParse({ ...entry, videoUrl: "http://youtu.be/abc" }).success).toBe(false);
  });

  it("takes the four movements the owner's own graphics use, and nothing else", () => {
    for (const trend of ["stabile", "sale", "boom", "scende"]) {
      expect(metaRankingEntrySchema.parse({ ...entry, trend }).trend).toBe(trend);
    }
    expect(metaRankingEntrySchema.parse(entry).trend).toBeNull();
    expect(metaRankingEntrySchema.safeParse({ ...entry, trend: "crolla" }).success).toBe(false);
  });
});

describe("snapshot form", () => {
  const base = { month: "2026-10", title: "T", sourceNote: "S", intro: "", publicationStatus: "draft" as const, active: false, seoTitle: "", seoDescription: "" };

  it("takes a month or a single day, because the meta is revised weekly", () => {
    expect(metaSnapshotSchema.safeParse(base).success).toBe(true);
    expect(metaSnapshotSchema.safeParse({ ...base, month: "2026-10-05" }).success).toBe(true);
    expect(metaSnapshotSchema.safeParse({ ...base, month: "2026-10-31" }).success).toBe(true);
  });

  it("refuses anything that would not make a sane archive URL", () => {
    for (const month of ["ottobre", "2026-13", "2026-1", "2026-10-00", "2026-10-32", "2026-10-5"]) {
      expect(metaSnapshotSchema.safeParse({ ...base, month }).success).toBe(false);
    }
  });
});

describe("resolveSnapshot", () => {
  it("groups the rows by tier and keeps each tier in rank order", async () => {
    const resolved = await resolveSnapshot(snapshot, [
      row({ id: 1, tier_type: "bit", rank: 1, piece_name: "LF" }),
      row({ id: 2, tier_type: "bit", rank: 2, piece_name: "MN" }),
      row({ id: 3, tier_type: "blade", rank: 1, piece_name: "Dragoon" }),
    ]);
    expect(resolved.entries.bit.map((entry) => entry.piece_name)).toEqual(["LF", "MN"]);
    expect(resolved.entries.blade.map((entry) => entry.piece_name)).toEqual(["Dragoon"]);
    expect(resolved.entries.ratchet).toEqual([]);
  });

  it("attaches the catalogue product when the entry names one", async () => {
    const resolved = await resolveSnapshot(snapshot, [row({ product_slug: "glory-valkerion-lf" })]);
    expect(resolved.entries.bit[0]?.product?.name).toBe("Glory Valkerion LF");
  });

  it("leaves the product null when the entry names none", async () => {
    const resolved = await resolveSnapshot(snapshot, [row({ product_slug: null })]);
    expect(resolved.entries.bit[0]?.product).toBeNull();
  });

  it("leaves the product null for a slug the catalogue no longer knows, instead of throwing", async () => {
    const resolved = await resolveSnapshot(snapshot, [row({ product_slug: "una-trottola-che-non-vendiamo-piu" })]);
    expect(resolved.entries.bit[0]?.product).toBeNull();
  });
});

describe("monthLabel", () => {
  it("writes the month the way the page says it", () => {
    expect(monthLabel("2026-10")).toBe("ottobre 2026");
    expect(monthLabel("2027-01")).toBe("gennaio 2027");
  });

  it("names the day when the period is a single week's update", () => {
    expect(monthLabel("2026-10-05")).toBe("5 ottobre 2026");
    expect(monthLabel("2026-10-12")).toBe("12 ottobre 2026");
  });

  it("falls back to the raw value rather than inventing a month", () => {
    expect(monthLabel("2026-99")).toBe("2026-99");
  });
});

describe("metaPageJsonLd", () => {
  const data = metaPageJsonLd({
    path: "/meta/2026-10",
    title: "Meta di ottobre 2026",
    description: "Podi top 3 di 153 tornei WBO.",
    datePublished: "2026-10-05T00:00:00.000Z",
    dateModified: "2026-10-06T00:00:00.000Z",
    rankings: [{ tier: "Bit", pieces: ["LF", "MN"] }],
  }) as Record<string, unknown>;

  it("carries the revision date, which is what makes a 'current meta' page readable as current", () => {
    expect(data["dateModified"]).toBe("2026-10-06T00:00:00.000Z");
    expect(data["datePublished"]).toBe("2026-10-05T00:00:00.000Z");
  });

  it("points at the production URL and the site's own organization", () => {
    expect(data["@id"]).toBe("https://geardropshop.it/meta/2026-10");
    expect(data["author"]).toEqual({ "@id": "https://geardropshop.it/#organization" });
  });

  it("lists each tier as its own ordered list", () => {
    const parts = data["hasPart"] as { name: string; numberOfItems: number }[];
    expect(parts[0]?.name).toBe("Bit");
    expect(parts[0]?.numberOfItems).toBe(2);
  });

  it("omits the publication date entirely when the month has never been published", () => {
    const draft = metaPageJsonLd({
      path: "/meta/2026-11", title: "T", description: "D", datePublished: null,
      dateModified: "2026-11-01T00:00:00.000Z", rankings: [],
    }) as Record<string, unknown>;
    expect("datePublished" in draft).toBe(false);
  });
});
