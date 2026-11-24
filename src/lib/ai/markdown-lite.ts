/**
 * The little markdown the assistant writes (bold, lists, short headings), read into plain data so
 * the page can draw it with React elements: nothing from a model answer ever becomes HTML.
 */

export type Inline =
  | { readonly kind: "text" | "strong" | "em" | "code"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

/**
 * Links only to the places the assistant sends people since 2026-11-24: this repository on GitHub
 * (pull requests and jobs of the code work), this project's Vercel previews, and the shop itself.
 * Any other address, another Vercel app included, stays text. The server hands the policy to the
 * page: the preview scope comes from its own VERCEL_URL, so the account name is not in the code.
 */
export type LinkPolicy = {
  /** "owner/name" of the repository. */
  readonly repo: string;
  /** What a preview host of this project ends with, after "geardrop-<hash>-"; null links no preview. */
  readonly previewScope: string | null;
};

export const DEFAULT_LINK_POLICY: LinkPolicy = { repo: "GengisChad/geardrop", previewScope: null };

const LINK = /\[([^\]\n]{1,160})\]\((https:\/\/[^\s)]+)\)|https:\/\/[^\s<>"'«»]+/g;

/** The preview scope out of a deployment's own VERCEL_URL, "geardrop-<hash>-<scope>". */
export function previewScopeOf(vercelUrl: string | undefined): string | null {
  return /^geardrop-[a-z0-9]+-([a-z0-9-]+\.vercel\.app)$/.exec(vercelUrl?.trim().toLowerCase() ?? "")?.[1] ?? null;
}

function allowedLink(url: string, policy: LinkPolicy): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url);
    if (protocol !== "https:") return false;
    if (hostname === "github.com") return pathname.toLowerCase().startsWith(`/${policy.repo.toLowerCase()}/`);
    if (/^(www\.)?geardropshop\.it$/.test(hostname)) return true;
    return policy.previewScope !== null && hostname.endsWith(`-${policy.previewScope}`) && /^geardrop-[a-z0-9-]+$/.test(hostname.slice(0, -policy.previewScope.length - 1));
  } catch {
    return false;
  }
}

/** Plain text with its https links to allowed places, bare or written as [label](url), made links. */
export function linkify(text: string, policy: LinkPolicy = DEFAULT_LINK_POLICY): readonly Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const labelled = match[2] !== undefined;
    // A bare address ends before the punctuation that closes its sentence.
    const href = labelled ? match[2]! : match[0].replace(/[.,;:!?)\]]+$/, "");
    if (!allowedLink(href, policy)) continue;
    const length = labelled ? match[0].length : href.length;
    if (match.index > last) parts.push({ kind: "text", text: text.slice(last, match.index) });
    parts.push({ kind: "link", text: labelled ? match[1]! : href, href });
    last = match.index + length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export type Block =
  | { readonly kind: "paragraph"; readonly lines: readonly (readonly Inline[])[] }
  | { readonly kind: "heading"; readonly inline: readonly Inline[] }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly (readonly Inline[])[] };

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|(?<![\w*])\*[^*\s][^*\n]*?\*(?![\w*])|(?<![\w_])_[^_\s][^_\n]*?_(?![\w_]))/g;

export function parseInline(text: string, policy: LinkPolicy = DEFAULT_LINK_POLICY): readonly Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index;
    if (at > last) parts.push(...linkify(text.slice(last, at), policy));
    if (token.startsWith("**") || token.startsWith("__")) parts.push({ kind: "strong", text: token.slice(2, -2) });
    else if (token.startsWith("`")) parts.push({ kind: "code", text: token.slice(1, -1) });
    else parts.push({ kind: "em", text: token.slice(1, -1) });
    last = at + token.length;
  }
  if (last < text.length) parts.push(...linkify(text.slice(last), policy));
  return parts;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function parseBlocks(text: string, policy: LinkPolicy = DEFAULT_LINK_POLICY): readonly Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] | null = null;
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const close = () => {
    if (paragraph) blocks.push({ kind: "paragraph", lines: paragraph });
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    paragraph = null;
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || RULE.test(line)) {
      close();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      blocks.push({ kind: "heading", inline: parseInline(heading[1]!, policy) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph || (list && list.ordered !== ordered)) close();
      list ??= { ordered, items: [] };
      list.items.push([...parseInline((bullet ?? numbered)![1]!, policy)]);
      continue;
    }
    if (list) close();
    paragraph ??= [];
    paragraph.push([...parseInline(line.trim(), policy)]);
  }
  close();
  return blocks;
}
