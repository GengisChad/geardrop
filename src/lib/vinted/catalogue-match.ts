/**
 * Which catalogue product a Vinted listing title names, without guessing.
 *
 * The owner writes Vinted titles by hand ("Beyblade X arena drop attack SOLO arena"). The
 * dependable signal is the piece's code (1-80MN, 9-60LR, 3-85N): the owner was asked to keep it
 * in every title. A code, or the full blade name, that points at exactly one product is a match
 * the shop acts on alone; anything looser is only offered to the owner in the panel.
 */

export type MatchConfidence = "high" | "medium" | "low";

export type SuggestedLine = { readonly slug: string; readonly quantity: number };

export type ListingMatch = {
  readonly lines: readonly SuggestedLine[];
  readonly confidence: MatchConfidence;
  readonly source: "code" | "name" | "arena-only" | "none";
  readonly reason: string;
};

export type MatchableProduct = { readonly slug: string; readonly name: string };

const CODE = /\b\d{1,2}-\d{2}[a-z]{0,3}\b/;

export function normalizeTitle(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

/**
 * "Shadow Shinobi 1-80MN" → code "1-80mn", blade "shadow shinobi". Short trailing marks
 * ("Glory Valkerion LF", "Hurricane Enlil IS", "Blast Pegasus A Tr") are dropped from the blade:
 * a title that leaves them out still names the piece.
 */
export function productKeys(name: string): { readonly code: string | null; readonly blade: string } {
  const normalized = normalizeTitle(name);
  const code = CODE.exec(normalized)?.[0] ?? null;
  const words = (code ? normalized.slice(0, normalized.indexOf(code)) : normalized).trim().split(" ").filter(Boolean);
  while (words.length > 2 && /^[a-z]{1,3}$/.test(words[words.length - 1]!)) words.pop();
  return { code, blade: words.join(" ") };
}

/**
 * The Battle Sets sell whole, and since 2026-10-05 also opened: the tops loose on the site, the
 * stadium alone on Vinted. The Drop Attack stadium is its own stock item, whose availability
 * follows the sets (an opened set's stadium first, then a sealed set opened for it). A set with no
 * such item yet (Sneak Attack) is taken off the shelf whole, which is what opening it means.
 */
const ARENA_ONLY: readonly { readonly slugs: readonly string[]; readonly words: readonly string[] }[] = [
  { slugs: ["drop-attack-arena", "drop-attack-battle-set"], words: ["drop attack"] },
  { slugs: ["sneak-attack-battle-set"], words: ["sneak attack"] },
];
const ARENA_ONLY_SLUGS = new Set(ARENA_ONLY.flatMap((set) => set.slugs));

const STADIUM = "(arena|stadio|beystadium)";
/**
 * "solo arena", "arena da sola", "stadio Sneak Attack da solo", "arena Drop Attack solo", or a
 * stadium listed "senza trottole". Read together with a stadium word, never on its own.
 */
const STADIUM_ALONE = new RegExp(
  [
    `\\b(solo|soltanto|only) (l |lo |la )?${STADIUM}\\b`,
    `\\b${STADIUM} (solo|soltanto|only)\\b`,
    "\\bda sol[ao]\\b",
    "\\b(solo|soltanto|only)$",
    // Not "senza lanciatore/i": a top is often listed without its launcher.
    "\\bsenza (le |i )?(trottole|trottola|beyblade|bey)\\b",
  ].join("|"),
);
/** The opposite listing: the tops without their stadium. */
const WITHOUT_STADIUM = new RegExp(`\\bsenza (l |lo |la )?${STADIUM}\\b`);

function arenaOnly(title: string, catalogue: readonly MatchableProduct[]): string | null {
  if (!new RegExp(`\\b${STADIUM}\\b`).test(title) || !STADIUM_ALONE.test(title) || WITHOUT_STADIUM.test(title)) return null;
  const set = ARENA_ONLY.find((entry) => entry.words.some((words) => contains(title, words)));
  return set?.slugs.find((slug) => catalogue.some((product) => product.slug === slug)) ?? null;
}

export function matchListing(
  title: string,
  itemCount: number,
  catalogue: readonly MatchableProduct[],
): ListingMatch {
  if (itemCount > 1) {
    return { lines: [], confidence: "low", source: "none", reason: `Ordine di ${itemCount} annunci: l'email non dice quali.` };
  }
  const normalized = normalizeTitle(title);
  const keyed = catalogue.map((product) => ({ product, ...productKeys(product.name) }));
  const byCode = keyed.filter((entry) => entry.code && contains(normalized, entry.code));

  const arena = arenaOnly(normalized, catalogue);
  // A title that also names a top ("Impact Drake drop attack arena …") is not a stadium alone.
  const namesATop = keyed.some(
    (entry) => !ARENA_ONLY_SLUGS.has(entry.product.slug) && entry.blade.split(" ").length >= 2 && contains(normalized, entry.blade),
  );
  if (arena && (byCode.length > 0 || namesATop)) {
    return { lines: [], confidence: "low", source: "none", reason: "Il titolo parla sia di un'arena da sola sia di un pezzo." };
  }
  if (arena) {
    const reason = arena.endsWith("-battle-set") ? "Arena venduta da sola: un set aperto." : "Arena venduta da sola.";
    return { lines: [{ slug: arena, quantity: 1 }], confidence: "high", source: "arena-only", reason };
  }
  if (byCode.length === 1) {
    const only = byCode[0]!;
    return { lines: [{ slug: only.product.slug, quantity: 1 }], confidence: "high", source: "code", reason: `Codice ${only.code!.toUpperCase()} nel titolo.` };
  }
  if (byCode.length > 1) {
    // Two products share a code only if their blades differ: the blade decides.
    const both = byCode.filter((entry) => contains(normalized, entry.blade));
    if (both.length === 1) {
      const only = both[0]!;
      return { lines: [{ slug: only.product.slug, quantity: 1 }], confidence: "high", source: "code", reason: `Codice e nome di ${only.product.name} nel titolo.` };
    }
    return { lines: [], confidence: "low", source: "none", reason: "Il titolo contiene codici di più prodotti." };
  }

  const byName = keyed.filter((entry) => entry.blade.split(" ").length >= 2 && contains(normalized, entry.blade));
  if (byName.length === 1) {
    const only = byName[0]!;
    return { lines: [{ slug: only.product.slug, quantity: 1 }], confidence: "medium", source: "name", reason: `Nome di ${only.product.name} nel titolo, senza codice.` };
  }
  return { lines: [], confidence: "low", source: "none", reason: byName.length > 1 ? "Il nome corrisponde a più prodotti." : "Nessun prodotto riconosciuto nel titolo." };
}

/**
 * The shop takes stock off the shelf alone only when the sale is unmistakable: an authenticated
 * Vinted email, one listing, and a code (or the arena-only rule) naming one product. A name
 * without a code, or Claude's reading, is offered in the panel for one tap instead.
 */
export function shouldApplyAutomatically(match: ListingMatch, authenticated: boolean): boolean {
  return authenticated && match.confidence === "high" && match.lines.length > 0;
}
