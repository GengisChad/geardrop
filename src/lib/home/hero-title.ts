/** The approved default headline, newline-typed so it flows through the same renderer. */
export const DEFAULT_HERO_TITLE = "Pronti alla\nbattaglia.\nNati per vincere.";

/**
 * Split a hero headline into rendered lines, with the last line carrying the lime accent.
 *
 * Newlines are honoured as explicit line breaks. A single-line title is split once at its
 * final sentence so the closing statement still lands in lime — the approved composition
 * puts "Nati per vincere." in the accent, and this keeps that true for any CMS headline
 * without special-casing that specific string.
 */
export function heroTitleLines(title: string): readonly string[] {
  const byNewline = title
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (byNewline.length > 1) return byNewline;

  // One line: split once at its final sentence boundary so the closing statement lands in
  // the accent. Scan every "<terminator><space>" break and keep the last one.
  const single = byNewline[0] ?? title.trim();
  const boundaries = [...single.matchAll(/[.!?]\s+/g)];
  const last = boundaries.at(-1);
  if (!last || last.index === undefined) return [single];

  const cut = last.index + last[0].length;
  return [single.slice(0, cut).trim(), single.slice(cut).trim()].filter((line) => line.length > 0);
}
