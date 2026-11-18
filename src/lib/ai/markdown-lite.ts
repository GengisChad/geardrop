/**
 * The little markdown the assistant writes (bold, lists, short headings), read into plain data so
 * the page can draw it with React elements: nothing from a model answer ever becomes HTML.
 */

export type Inline = { readonly kind: "text" | "strong" | "em" | "code"; readonly text: string };

export type Block =
  | { readonly kind: "paragraph"; readonly lines: readonly (readonly Inline[])[] }
  | { readonly kind: "heading"; readonly inline: readonly Inline[] }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly (readonly Inline[])[] };

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|(?<![\w*])\*[^*\s][^*\n]*?\*(?![\w*])|(?<![\w_])_[^_\s][^_\n]*?_(?![\w_]))/g;

export function parseInline(text: string): readonly Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index;
    if (at > last) parts.push({ kind: "text", text: text.slice(last, at) });
    if (token.startsWith("**") || token.startsWith("__")) parts.push({ kind: "strong", text: token.slice(2, -2) });
    else if (token.startsWith("`")) parts.push({ kind: "code", text: token.slice(1, -1) });
    else parts.push({ kind: "em", text: token.slice(1, -1) });
    last = at + token.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function parseBlocks(text: string): readonly Block[] {
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
      blocks.push({ kind: "heading", inline: parseInline(heading[1]!) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph || (list && list.ordered !== ordered)) close();
      list ??= { ordered, items: [] };
      list.items.push([...parseInline((bullet ?? numbered)![1]!)]);
      continue;
    }
    if (list) close();
    paragraph ??= [];
    paragraph.push([...parseInline(line.trim())]);
  }
  close();
  return blocks;
}
