import { describe, expect, it } from "vitest";
import {
  composeDescription,
  encodeKeywords,
  LIMITS,
  mergeTags,
  ownText,
  parsePlan,
  planVideo,
  tagsLength,
} from "../../scripts/youtube-seo";

/**
 * The script writes to 26 live video descriptions, so the properties that keep a second
 * run from damaging the first are the ones worth pinning down: the block is replaced and
 * not stacked, the owner's own text survives, and nothing is sent that the API would
 * reject for length.
 */

const BLOCK = "Trottole su GEAR//DROP:\nhttps://geardropshop.it?utm_content={{id}}";

describe("composeDescription", () => {
  it("appends the block under the owner's text", () => {
    const result = composeDescription("Ciao a tutti.", undefined, BLOCK, "abc123");
    expect(result.startsWith("Ciao a tutti.")).toBe(true);
    expect(result).toContain("https://geardropshop.it?utm_content=abc123");
  });

  it("replaces the previous block instead of stacking a second one", () => {
    const first = composeDescription("Ciao a tutti.", undefined, BLOCK, "abc123");
    const second = composeDescription(first, undefined, "Blocco nuovo", "abc123");
    expect(second).toBe(composeDescription("Ciao a tutti.", undefined, "Blocco nuovo", "abc123"));
    expect(second).toContain("Blocco nuovo");
    expect(second).not.toContain("geardropshop.it");
  });

  it("is idempotent: running twice with the same plan changes nothing the second time", () => {
    const once = composeDescription("Descrizione originale.", undefined, BLOCK, "abc123");
    expect(composeDescription(once, undefined, BLOCK, "abc123")).toBe(once);
  });

  it("keeps the owner's text even when it is edited in Studio between runs", () => {
    const once = composeDescription("Prima stesura.", undefined, BLOCK, "abc123");
    const edited = once.replace("Prima stesura.", "Testo riscritto a mano.");
    expect(composeDescription(edited, undefined, BLOCK, "abc123")).toContain("Testo riscritto a mano.");
  });

  it("substitutes the video id per video, so utm_content is never shared", () => {
    const a = composeDescription("", undefined, BLOCK, "aaaaaaaaaaa");
    const b = composeDescription("", undefined, BLOCK, "bbbbbbbbbbb");
    expect(a).toContain("utm_content=aaaaaaaaaaa");
    expect(b).toContain("utm_content=bbbbbbbbbbb");
  });

  it("never exceeds the description limit the API enforces", () => {
    const result = composeDescription("x".repeat(6000), undefined, BLOCK, "abc123");
    expect(result.length).toBeLessThanOrEqual(LIMITS.videoDescription);
  });

  it("leaves the description untouched when the plan carries no block", () => {
    expect(composeDescription("Solo il mio testo.", undefined, undefined, "abc123")).toBe("Solo il mio testo.");
  });

  it("does not open an empty description with blank lines", () => {
    const result = composeDescription("", undefined, BLOCK, "abc123");
    expect(result.startsWith("\n")).toBe(false);
    expect(composeDescription(result, undefined, BLOCK, "abc123")).toBe(result);
  });
});

describe("ownText", () => {
  it("returns the whole description when no block was ever written", () => {
    expect(ownText("Nessun blocco qui.")).toBe("Nessun blocco qui.");
  });

  it("cuts everything from the first marker down", () => {
    const withBlock = composeDescription("Testo mio.", undefined, BLOCK, "abc123");
    expect(ownText(withBlock)).toBe("Testo mio.");
  });
});

describe("mergeTags", () => {
  it("keeps the existing tags first and adds the new ones", () => {
    expect(mergeTags(["dran"], ["beyblade x"])).toEqual(["dran", "beyblade x"]);
  });

  it("does not add a tag the video already carries in another case", () => {
    expect(mergeTags(["Beyblade X"], ["beyblade x"])).toEqual(["Beyblade X"]);
  });

  it("stops before the 500-character budget instead of sending a rejected list", () => {
    const existing = Array.from({ length: 40 }, (_, index) => `tag-lunghissimo-numero-${index}`);
    const merged = mergeTags(existing, ["beyblade x"]);
    expect(tagsLength(merged)).toBeLessThanOrEqual(LIMITS.videoTagsTotal);
  });

  it("counts the quotes a multi-word tag costs, the way YouTube does", () => {
    expect(tagsLength(["beyblade x"])).toBe("beyblade x".length + 2);
    expect(tagsLength(["beyblade"])).toBe("beyblade".length);
    expect(tagsLength([])).toBe(0);
  });
});

describe("encodeKeywords", () => {
  it("quotes multi-word phrases and joins with spaces", () => {
    expect(encodeKeywords(["beyblade", "beyblade x"])).toBe('beyblade "beyblade x"');
  });

  it("refuses a list the API would reject rather than spending the quota to find out", () => {
    expect(() => encodeKeywords([..."x".repeat(60)].map((_, index) => `parolachiave${index}`))).toThrow(
      /500/,
    );
  });
});

describe("planVideo", () => {
  const snippet = { title: "Titolo", description: "Testo.", categoryId: "20", tags: ["dran"] };
  const plan = parsePlan(JSON.stringify({ block: BLOCK, tags: ["beyblade x"], videos: {} }));

  it("reports the description and the tags as changed on a first run", () => {
    const change = planVideo("abc123", snippet, plan);
    expect(change?.fields).toEqual(["descrizione", "tag"]);
  });

  it("carries the title and the category through untouched, which the API would otherwise clear", () => {
    const change = planVideo("abc123", snippet, plan);
    expect(change?.after.title).toBe("Titolo");
    expect(change?.after.categoryId).toBe("20");
  });

  it("returns nothing to do once the channel already matches the plan", () => {
    const change = planVideo("abc123", snippet, plan);
    expect(change).not.toBeNull();
    expect(planVideo("abc123", change!.after, plan)).toBeNull();
  });

  it("leaves a video that already curates its own tags alone", () => {
    const curated = { ...snippet, tags: Array.from({ length: 25 }, (_, index) => `tag-${index}`) };
    expect(planVideo("abc123", curated, plan)?.after.tags).toEqual(curated.tags);
  });

  it("still fills the tags of a video that has none", () => {
    const bare = { ...snippet, tags: [] };
    expect(planVideo("abc123", bare, plan)?.after.tags).toEqual(["beyblade x"]);
  });

  it("lets a per-video block override the shared one", () => {
    const override = parsePlan(
      JSON.stringify({ block: BLOCK, videos: { abc123: { block: "Blocco solo per questo video" } } }),
    );
    expect(planVideo("abc123", snippet, override)?.after.description).toContain("Blocco solo per questo video");
  });
});
